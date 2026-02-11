import type { ClientSession } from "mongoose";
import {
  SubscriptionType,
  type SubscriptionTypeInput,
  type SubscriptionTypeDocument,
} from "./models/subscription_type.model.ts";
import { AppError } from "../../errors/AppError.ts";

/* ---------- Plan Limits Interface ---------- */

export interface PlanLimits {
  plan: string;
  displayName: string;
  billingModel: "fixed" | "dynamic";
  baseCost: number;
  pricePerSeat: number;
  maxSeats: number;
  maxCatalogItems: number;
  features: string[];
  stripePriceIdBase?: string | undefined;
  stripePriceIdSeat?: string | undefined;
}

/* ---------- In-Memory Cache ---------- */

let planLimitsCache: Map<string, PlanLimits> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ---------- Subscription Type Service ---------- */

export const subscriptionTypeService = {
  /**
   * Creates a new subscription type.
   * Only super admin should call this.
   */
  async create(
    data: SubscriptionTypeInput,
    session?: ClientSession,
  ): Promise<SubscriptionTypeDocument> {
    const existing = await SubscriptionType.findOne({
      plan: data.plan,
    }).session(session ?? null);
    if (existing) {
      throw AppError.conflict(
        `Subscription type with plan "${data.plan}" already exists`,
      );
    }

    const doc = new SubscriptionType(data);
    const subscriptionType = session
      ? await doc.save({ session })
      : await doc.save();

    // Invalidate cache
    this.invalidateCache();

    return subscriptionType as SubscriptionTypeDocument;
  },

  /**
   * Updates an existing subscription type.
   */
  async update(
    plan: string,
    data: Partial<Omit<SubscriptionTypeInput, "plan">>,
    session?: ClientSession,
  ): Promise<SubscriptionTypeDocument> {
    const updateOptions = session
      ? { new: true, runValidators: true, session }
      : { new: true, runValidators: true };

    const subscriptionType = await SubscriptionType.findOneAndUpdate(
      { plan: plan.toLowerCase() },
      { $set: data },
      updateOptions,
    );

    if (!subscriptionType) {
      throw AppError.notFound(`Subscription type "${plan}" not found`);
    }

    // Invalidate cache
    this.invalidateCache();

    return subscriptionType as SubscriptionTypeDocument;
  },

  /**
   * Deletes a subscription type (soft delete via status change).
   */
  async deactivate(plan: string, session?: ClientSession): Promise<void> {
    const updateOptions = session ? { session } : undefined;

    const result = await SubscriptionType.updateOne(
      { plan: plan.toLowerCase() },
      { $set: { status: "inactive" } },
      updateOptions,
    );

    if (result.matchedCount === 0) {
      throw AppError.notFound(`Subscription type "${plan}" not found`);
    }

    // Invalidate cache
    this.invalidateCache();
  },

  /**
   * Finds a subscription type by plan name.
   */
  async findByPlan(plan: string): Promise<SubscriptionTypeDocument | null> {
    return SubscriptionType.findOne({
      plan: plan.toLowerCase(),
    }) as Promise<SubscriptionTypeDocument | null>;
  },

  /**
   * Lists all subscription types.
   */
  async findAll(
    includeInactive: boolean = false,
  ): Promise<SubscriptionTypeDocument[]> {
    const query = includeInactive ? {} : { status: "active" };
    return SubscriptionType.find(query).sort({
      sortOrder: 1,
    }) as unknown as Promise<SubscriptionTypeDocument[]>;
  },

  /**
   * Gets plan limits for a specific plan.
   * Uses caching for performance.
   */
  async getPlanLimits(plan: string): Promise<PlanLimits> {
    const cache = await this.getAllPlanLimits();
    const limits = cache.get(plan.toLowerCase());

    if (!limits) {
      throw AppError.notFound(`Subscription plan "${plan}" not found`);
    }

    return limits;
  },

  /**
   * Gets all plan limits (cached).
   */
  async getAllPlanLimits(): Promise<Map<string, PlanLimits>> {
    const now = Date.now();

    // Return cached data if still valid
    if (planLimitsCache && now - cacheTimestamp < CACHE_TTL_MS) {
      return planLimitsCache;
    }

    // Rebuild cache
    const subscriptionTypes = await SubscriptionType.find({
      status: "active",
    }).sort({ sortOrder: 1 });

    const newCache = new Map<string, PlanLimits>();

    for (const st of subscriptionTypes) {
      newCache.set(st.plan, {
        plan: st.plan,
        displayName: st.displayName,
        billingModel: st.billingModel as "fixed" | "dynamic",
        baseCost: st.baseCost,
        pricePerSeat: st.pricePerSeat,
        maxSeats: st.maxSeats,
        maxCatalogItems: st.maxCatalogItems,
        features: st.features ?? [],
        stripePriceIdBase: st.stripePriceIdBase ?? undefined,
        stripePriceIdSeat: st.stripePriceIdSeat ?? undefined,
      });
    }

    planLimitsCache = newCache;
    cacheTimestamp = now;

    return newCache;
  },

  /**
   * Gets plan limits as an array (for API responses).
   */
  async getAllPlanLimitsArray(): Promise<PlanLimits[]> {
    const cache = await this.getAllPlanLimits();
    return Array.from(cache.values());
  },

  /**
   * Checks if a plan exists and is active.
   */
  async planExists(plan: string): Promise<boolean> {
    const cache = await this.getAllPlanLimits();
    return cache.has(plan.toLowerCase());
  },

  /**
   * Validates seat count against plan limits.
   */
  async validateSeatCount(plan: string, seatCount: number): Promise<void> {
    const limits = await this.getPlanLimits(plan);

    // For fixed billing model, check against maxSeats
    if (limits.billingModel === "fixed") {
      if (limits.maxSeats !== -1 && seatCount > limits.maxSeats) {
        throw AppError.badRequest(
          `Plan "${plan}" allows maximum ${limits.maxSeats} seats`,
          { code: "PLAN_LIMIT_REACHED", resource: "seats" },
        );
      }
    }
    // Dynamic billing has no seat limit (pay per seat)
  },

  /**
   * Validates catalog item count against plan limits.
   */
  async validateCatalogItemCount(
    plan: string,
    currentCount: number,
    addingCount: number = 1,
  ): Promise<void> {
    const limits = await this.getPlanLimits(plan);

    // -1 means unlimited
    if (
      limits.maxCatalogItems !== -1 &&
      currentCount + addingCount > limits.maxCatalogItems
    ) {
      throw AppError.badRequest(
        `Catalog item limit reached. Plan "${plan}" allows maximum ${limits.maxCatalogItems} items.`,
        { code: "PLAN_LIMIT_REACHED", resource: "catalog_items" },
      );
    }
  },

  /**
   * Calculates subscription cost based on plan and seat count.
   */
  async calculateCost(
    plan: string,
    seatCount: number,
  ): Promise<{ baseCost: number; seatCost: number; totalCost: number }> {
    const limits = await this.getPlanLimits(plan);

    const baseCost = limits.baseCost;
    const seatCost =
      limits.billingModel === "dynamic" ? limits.pricePerSeat * seatCount : 0;
    const totalCost = baseCost + seatCost;

    return { baseCost, seatCost, totalCost };
  },

  /**
   * Invalidates the plan limits cache.
   */
  invalidateCache(): void {
    planLimitsCache = null;
    cacheTimestamp = 0;
  },

  /**
   * Seeds default subscription types if none exist.
   * Should be called during app initialization.
   */
  async seedDefaults(): Promise<void> {
    const count = await SubscriptionType.countDocuments();
    if (count > 0) {
      return; // Already seeded
    }

    const defaults: SubscriptionTypeInput[] = [
      {
        plan: "free",
        displayName: "Free",
        description: "Perfect for trying out the platform",
        billingModel: "fixed",
        baseCost: 0,
        pricePerSeat: 0,
        maxSeats: 1,
        maxCatalogItems: 10,
        features: ["Basic catalog management", "Single user"],
        sortOrder: 0,
        status: "active",
      },
      {
        plan: "starter",
        displayName: "Starter",
        description: "For small teams getting started",
        billingModel: "dynamic",
        baseCost: 2900, // $29.00
        pricePerSeat: 500, // $5.00 per seat
        maxSeats: 5,
        maxCatalogItems: 100,
        features: [
          "Up to 5 team members",
          "100 catalog items",
          "Email support",
        ],
        sortOrder: 1,
        status: "active",
      },
      {
        plan: "professional",
        displayName: "Professional",
        description: "For growing businesses",
        billingModel: "dynamic",
        baseCost: 9900, // $99.00
        pricePerSeat: 400, // $4.00 per seat
        maxSeats: 20,
        maxCatalogItems: 500,
        features: [
          "Up to 20 team members",
          "500 catalog items",
          "Priority support",
          "Analytics dashboard",
        ],
        sortOrder: 2,
        status: "active",
      },
      {
        plan: "enterprise",
        displayName: "Enterprise",
        description: "For large organizations with custom needs",
        billingModel: "dynamic",
        baseCost: 29900, // $299.00
        pricePerSeat: 300, // $3.00 per seat
        maxSeats: -1, // unlimited
        maxCatalogItems: -1, // unlimited
        features: [
          "Unlimited team members",
          "Unlimited catalog items",
          "Dedicated support",
          "Custom integrations",
          "SLA",
        ],
        sortOrder: 3,
        status: "active",
      },
    ];

    await SubscriptionType.insertMany(defaults);
    this.invalidateCache();
  },
};

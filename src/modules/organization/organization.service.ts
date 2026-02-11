import type { Types, ClientSession } from "mongoose";
import {
  Organization,
  type OrganizationInput,
  type SubscriptionPlan,
} from "./models/organization.model.ts";
import { AppError } from "../../errors/AppError.ts";
import type { PlanUsage } from "./types/index.ts";
import { subscriptionTypeService } from "../subscription_type/subscription_type.service.ts";

/* ---------- Organization Service ---------- */

export const organizationService = {
  /**
   * Creates a new organization with the specified owner.
   */
  async create(
    data: OrganizationInput,
    session?: ClientSession,
  ): Promise<InstanceType<typeof Organization>> {
    const existing = await Organization.findOne({ email: data.email }).session(
      session ?? null,
    );
    if (existing) {
      throw AppError.conflict("An organization with this email already exists");
    }

    const orgDoc = new Organization(data);
    const organization = session
      ? await orgDoc.save({ session })
      : await orgDoc.save();
    return organization;
  },

  /**
   * Finds an organization by ID with org-scoping validation.
   */
  async findById(
    organizationId: Types.ObjectId | string,
    requestingOrgId?: Types.ObjectId | string,
  ): Promise<InstanceType<typeof Organization>> {
    // If requestingOrgId is provided, validate org-scoping
    if (
      requestingOrgId &&
      organizationId.toString() !== requestingOrgId.toString()
    ) {
      throw AppError.unauthorized("Access denied to this organization");
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw AppError.notFound("Organization not found");
    }
    return organization;
  },

  /**
   * Updates organization details (non-subscription fields).
   */
  async update(
    organizationId: Types.ObjectId | string,
    data: Partial<Omit<OrganizationInput, "ownerId">>,
    session?: ClientSession,
  ): Promise<InstanceType<typeof Organization>> {
    const updateOptions = session
      ? { new: true, runValidators: true, session }
      : { new: true, runValidators: true };
    const organization = await Organization.findByIdAndUpdate(
      organizationId,
      { $set: data },
      updateOptions,
    );

    if (!organization) {
      throw AppError.notFound("Organization not found");
    }
    return organization as InstanceType<typeof Organization>;
  },

  /**
   * Validates if the organization can add more catalog items based on plan limits.
   */
  async canAddCatalogItem(
    organizationId: Types.ObjectId | string,
  ): Promise<boolean> {
    const org =
      await Organization.findById(organizationId).select("subscription");
    if (!org) {
      throw AppError.notFound("Organization not found");
    }

    const plan = (org.subscription?.plan ?? "free") as SubscriptionPlan;
    const limits = await subscriptionTypeService.getPlanLimits(plan);
    const currentCount = org.subscription?.catalogItemCount ?? 0;

    // -1 means unlimited
    if (limits.maxCatalogItems === -1) return true;
    return currentCount < limits.maxCatalogItems;
  },

  /**
   * Increments the catalog item count for an organization.
   * Throws if limit is reached.
   */
  async incrementCatalogItemCount(
    organizationId: Types.ObjectId | string,
    count: number = 1,
    session?: ClientSession,
  ): Promise<void> {
    const org = await Organization.findById(organizationId)
      .select("subscription")
      .session(session ?? null);
    if (!org) {
      throw AppError.notFound("Organization not found");
    }

    const plan = (org.subscription?.plan ?? "free") as SubscriptionPlan;
    const currentCount = org.subscription?.catalogItemCount ?? 0;

    // Validate against plan limits
    await subscriptionTypeService.validateCatalogItemCount(
      plan,
      currentCount,
      count,
    );

    const updateOptions = session ? { session } : undefined;
    await Organization.updateOne(
      { _id: organizationId },
      { $inc: { "subscription.catalogItemCount": count } },
      updateOptions,
    );
  },

  /**
   * Decrements the catalog item count for an organization.
   */
  async decrementCatalogItemCount(
    organizationId: Types.ObjectId | string,
    count: number = 1,
    session?: ClientSession,
  ): Promise<void> {
    const updateOptions = session ? { session } : undefined;
    await Organization.updateOne(
      { _id: organizationId },
      { $inc: { "subscription.catalogItemCount": -count } },
      updateOptions,
    );
  },

  /**
   * Validates if the organization can add more seats based on plan limits.
   */
  async canAddSeat(organizationId: Types.ObjectId | string): Promise<boolean> {
    const org =
      await Organization.findById(organizationId).select("subscription");
    if (!org) {
      throw AppError.notFound("Organization not found");
    }

    const plan = (org.subscription?.plan ?? "free") as SubscriptionPlan;
    const limits = await subscriptionTypeService.getPlanLimits(plan);
    const currentSeats = org.subscription?.seatCount ?? 1;

    // -1 means unlimited
    if (limits.maxSeats === -1) return true;
    return currentSeats < limits.maxSeats;
  },

  /**
   * Updates the seat count for an organization.
   */
  async updateSeatCount(
    organizationId: Types.ObjectId | string,
    seatCount: number,
    session?: ClientSession,
  ): Promise<void> {
    const org = await Organization.findById(organizationId)
      .select("subscription")
      .session(session ?? null);
    if (!org) {
      throw AppError.notFound("Organization not found");
    }

    const plan = (org.subscription?.plan ?? "free") as SubscriptionPlan;

    // Validate against plan limits
    await subscriptionTypeService.validateSeatCount(plan, seatCount);

    const updateOptions = session ? { session } : undefined;
    await Organization.updateOne(
      { _id: organizationId },
      { $set: { "subscription.seatCount": seatCount } },
      updateOptions,
    );
  },

  /**
   * Gets plan usage information for an organization.
   */
  async getPlanUsage(
    organizationId: Types.ObjectId | string,
  ): Promise<PlanUsage> {
    const org =
      await Organization.findById(organizationId).select("subscription");
    if (!org) {
      throw AppError.notFound("Organization not found");
    }

    const plan = (org.subscription?.plan ?? "free") as SubscriptionPlan;
    const limits = await subscriptionTypeService.getPlanLimits(plan);
    const currentCatalogItems = org.subscription?.catalogItemCount ?? 0;
    const currentSeats = org.subscription?.seatCount ?? 1;

    return {
      currentCatalogItems,
      maxCatalogItems: limits.maxCatalogItems,
      currentSeats,
      maxSeats: limits.maxSeats,
      canAddCatalogItem:
        limits.maxCatalogItems === -1 ||
        currentCatalogItems < limits.maxCatalogItems,
      canAddSeat: limits.maxSeats === -1 || currentSeats < limits.maxSeats,
    };
  },

  /**
   * Updates subscription details (used by Stripe webhooks).
   */
  async updateSubscription(
    organizationId: Types.ObjectId | string,
    subscriptionData: {
      plan?: SubscriptionPlan;
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
      cancelAtPeriodEnd?: boolean;
    },
    session?: ClientSession,
  ): Promise<void> {
    const updateFields: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(subscriptionData)) {
      if (value !== undefined) {
        updateFields[`subscription.${key}`] = value;
      }
    }

    const updateOptions = session ? { session } : undefined;
    await Organization.updateOne(
      { _id: organizationId },
      { $set: updateFields },
      updateOptions,
    );
  },

  /**
   * Finds organization by Stripe customer ID.
   */
  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<InstanceType<typeof Organization> | null> {
    return Organization.findOne({
      "subscription.stripeCustomerId": stripeCustomerId,
    });
  },

  /**
   * Suspends an organization (e.g., due to payment failure).
   */
  async suspend(
    organizationId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<void> {
    const updateOptions = session ? { session } : undefined;
    await Organization.updateOne(
      { _id: organizationId },
      { $set: { status: "suspended" } },
      updateOptions,
    );
  },

  /**
   * Reactivates a suspended organization.
   */
  async reactivate(
    organizationId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<void> {
    const updateOptions = session ? { session } : undefined;
    await Organization.updateOne(
      { _id: organizationId },
      { $set: { status: "active" } },
      updateOptions,
    );
  },

  /**
   * Cancels an organization's subscription.
   */
  async cancel(
    organizationId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<void> {
    const updateOptions = session ? { session } : undefined;
    await Organization.updateOne(
      { _id: organizationId },
      { $set: { status: "cancelled", "subscription.cancelAtPeriodEnd": true } },
      updateOptions,
    );
  },
};

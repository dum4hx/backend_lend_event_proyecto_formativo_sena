import type { Types, ClientSession } from "mongoose";
import {
  Organization,
  type OrganizationInput,
  type SubscriptionPlan,
  type OrganizationSettingsInput,
} from "./models/organization.model.ts";
import { AppError } from "../../errors/AppError.ts";
import type { PlanUsage } from "./types/index.ts";
import { subscriptionTypeService } from "../subscription_type/subscription_type.service.ts";
import { Location } from "../location/models/location.model.ts";

/* ---------- Internal Helpers ---------- */

/**
 * Tries to resolve plan limits from the live SubscriptionType service.
 * Falls back to the limits snapshotted on the organization's subscription
 * subdocument when the plan has been deleted or disabled, so that existing
 * organizations are never broken by subscription-type lifecycle changes.
 */
async function getEffectiveLimits(
  plan: string,
  storedMaxSeats: number,
  storedMaxCatalogItems: number,
): Promise<{ maxSeats: number; maxCatalogItems: number }> {
  try {
    const limits = await subscriptionTypeService.getPlanLimits(plan);
    return {
      maxSeats: limits.maxSeats,
      maxCatalogItems: limits.maxCatalogItems,
    };
  } catch {
    // Plan no longer active in SubscriptionType — use the snapshotted limits.
    return { maxSeats: storedMaxSeats, maxCatalogItems: storedMaxCatalogItems };
  }
}

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
    const limits = await getEffectiveLimits(
      plan,
      org.subscription?.maxSeats ?? -1,
      org.subscription?.maxCatalogItems ?? -1,
    );
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

    // Validate against plan limits (falls back to snapshotted limits if plan is gone).
    const limits = await getEffectiveLimits(
      plan,
      org.subscription?.maxSeats ?? -1,
      org.subscription?.maxCatalogItems ?? -1,
    );
    if (
      limits.maxCatalogItems !== -1 &&
      currentCount + count > limits.maxCatalogItems
    ) {
      throw AppError.badRequest(
        `Catalog item limit reached. Plan "${plan}" allows maximum ${limits.maxCatalogItems} items.`,
        { code: "PLAN_LIMIT_REACHED", resource: "catalog_items" },
      );
    }

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
    const limits = await getEffectiveLimits(
      plan,
      org.subscription?.maxSeats ?? -1,
      org.subscription?.maxCatalogItems ?? -1,
    );
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

    // Validate against plan limits (falls back to snapshotted limits if plan is gone).
    const limits = await getEffectiveLimits(
      plan,
      org.subscription?.maxSeats ?? -1,
      org.subscription?.maxCatalogItems ?? -1,
    );
    if (limits.maxSeats !== -1 && seatCount > limits.maxSeats) {
      throw AppError.badRequest(
        `Plan "${plan}" allows maximum ${limits.maxSeats} seats`,
        { code: "PLAN_LIMIT_REACHED", resource: "seats" },
      );
    }

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
    const limits = await getEffectiveLimits(
      plan,
      org.subscription?.maxSeats ?? -1,
      org.subscription?.maxCatalogItems ?? -1,
    );
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

    // When the plan changes, snapshot its current limits so these orgs remain
    // operational if the SubscriptionType is later deleted or disabled.
    if (subscriptionData.plan !== undefined) {
      try {
        const planLimits = await subscriptionTypeService.getPlanLimits(
          subscriptionData.plan,
        );
        updateFields["subscription.maxSeats"] = planLimits.maxSeats;
        updateFields["subscription.maxCatalogItems"] =
          planLimits.maxCatalogItems;
      } catch {
        // Plan not found — preserve existing snapshot.
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

  /**
   * Validates if a list of location IDs belong to the organization.
   */
  async validateLocationIds(
    organizationId: Types.ObjectId | string,
    locationIds: (Types.ObjectId | string)[],
  ): Promise<void> {
    const org = await Organization.findById(organizationId).select("locations");
    if (!org) {
      throw AppError.notFound("Organization not found");
    }
    const locations = await Location.find({
      _id: { $in: locationIds },
      organizationId,
    }).select("_id");
    if (locations.length !== locationIds.length) {
      throw AppError.badRequest("One or more location IDs are invalid");
    }
  },

  /**
   * Updates organization-level settings (policies).
   * Only modifies provided fields — existing settings are preserved.
   */
  async updateSettings(
    organizationId: Types.ObjectId | string,
    data: OrganizationSettingsInput,
  ): Promise<{ settings: { damageDueDays: number; requireFullPaymentBeforeCheckout: boolean } }> {
    const updateFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateFields[`settings.${key}`] = value;
      }
    }

    const organization = await Organization.findByIdAndUpdate(
      organizationId,
      { $set: updateFields },
      { new: true, runValidators: true },
    ).select("settings");

    if (!organization) {
      throw AppError.notFound("Organization not found");
    }

    return {
      settings: {
        damageDueDays: organization.settings?.damageDueDays ?? 30,
        requireFullPaymentBeforeCheckout:
          organization.settings?.requireFullPaymentBeforeCheckout ?? false,
      },
    };
  },

  /**
   * Returns the current settings for an organization.
   */
  async getSettings(
    organizationId: Types.ObjectId | string,
  ): Promise<{ damageDueDays: number; requireFullPaymentBeforeCheckout: boolean }> {
    const org = await Organization.findById(organizationId).select("settings");
    if (!org) {
      throw AppError.notFound("Organization not found");
    }
    return {
      damageDueDays: org.settings?.damageDueDays ?? 30,
      requireFullPaymentBeforeCheckout:
        org.settings?.requireFullPaymentBeforeCheckout ?? false,
    };
  },
};

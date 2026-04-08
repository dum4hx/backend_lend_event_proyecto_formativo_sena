import Stripe from "stripe";
import { AppError } from "../../errors/AppError.ts";
import { logger } from "../../utils/logger.ts";
import {
  Organization,
  type SubscriptionPlan,
} from "../organization/models/organization.model.ts";
import { organizationService } from "../organization/organization.service.ts";
import { subscriptionTypeService } from "../subscription_type/subscription_type.service.ts";
import { BillingEvent } from "./models/billing_event.model.ts";
import type { Types } from "mongoose";

/* ---------- Stripe Configuration ---------- */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY) {
  logger.warn("STRIPE_SECRET_KEY not set. Billing features will be disabled.");
}

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

/* ---------- Helper Functions ---------- */

const ensureStripe = (): Stripe => {
  if (!stripe) {
    throw AppError.internal("Stripe no está configurado");
  }
  return stripe;
};

/**
 * Gets or creates Stripe price IDs for a plan.
 * If the subscription type does not have a stripePriceIdBase or
 * stripePriceIdSeat, new recurring Stripe Prices are created and
 * persisted back to the subscription type document.
 */
const getOrCreateStripePriceIds = async (
  plan: SubscriptionPlan,
): Promise<{ base: string; seat: string } | null> => {
  if (plan === "free") return null;

  const stripeClient = ensureStripe();
  const limits = await subscriptionTypeService.getPlanLimits(plan);

  let { stripePriceIdBase, stripePriceIdSeat } = limits;
  let needsUpdate = false;

  // Create base price in Stripe if missing
  if (!stripePriceIdBase) {
    logger.info(`Creating Stripe base price for plan "${plan}"...`);

    const baseProduct = await stripeClient.products.create({
      name: `${limits.displayName} – Base`,
      metadata: { plan, type: "base" },
    });

    const basePrice = await stripeClient.prices.create({
      product: baseProduct.id,
      unit_amount: limits.baseCost,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { plan, type: "base" },
    });

    stripePriceIdBase = basePrice.id;
    needsUpdate = true;
    logger.info(
      `Stripe base price created for plan "${plan}": ${basePrice.id}`,
    );
  }

  // Create seat price in Stripe if missing
  if (!stripePriceIdSeat) {
    logger.info(`Creating Stripe seat price for plan "${plan}"...`);

    const seatProduct = await stripeClient.products.create({
      name: `${limits.displayName} – Per Seat`,
      metadata: { plan, type: "seat" },
    });

    const seatPrice = await stripeClient.prices.create({
      product: seatProduct.id,
      unit_amount: limits.pricePerSeat,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { plan, type: "seat" },
    });

    stripePriceIdSeat = seatPrice.id;
    needsUpdate = true;
    logger.info(
      `Stripe seat price created for plan "${plan}": ${seatPrice.id}`,
    );
  }

  // Persist newly created IDs back to the subscription type
  if (needsUpdate) {
    await subscriptionTypeService.update(plan, {
      ...(stripePriceIdBase ? { stripePriceIdBase } : {}),
      ...(stripePriceIdSeat ? { stripePriceIdSeat } : {}),
    });
  }

  return {
    base: stripePriceIdBase,
    seat: stripePriceIdSeat,
  };
};

/* ---------- Billing Service ---------- */

export const billingService = {
  /**
   * Creates a Stripe customer for an organization.
   */
  async createStripeCustomer(
    organizationId: Types.ObjectId | string,
    email: string,
    name: string,
  ): Promise<string> {
    const stripeClient = ensureStripe();

    const customer = await stripeClient.customers.create({
      email,
      name,
      metadata: {
        organizationId: organizationId.toString(),
      },
    });

    // Update organization with Stripe customer ID
    await organizationService.updateSubscription(organizationId, {
      stripeCustomerId: customer.id,
    });

    logger.info("Stripe customer created", {
      organizationId: organizationId.toString(),
      stripeCustomerId: customer.id,
    });

    return customer.id;
  },

  /**
   * Creates a Stripe Checkout session for subscription.
   */
  async createCheckoutSession(
    organizationId: Types.ObjectId | string,
    plan: SubscriptionPlan,
    seatCount: number,
    successUrl: string,
    cancelUrl: string,
  ): Promise<string> {
    const stripeClient = ensureStripe();

    if (plan === "free") {
      throw AppError.badRequest(
        "No se puede crear un checkout para el plan gratuito",
      );
    }

    // Validate plan exists and is active
    const planValid = await subscriptionTypeService.planExists(plan);
    if (!planValid) {
      throw AppError.badRequest(`El plan '${plan}' no existe o no está activo`);
    }

    // Validate seat count against plan limits
    await subscriptionTypeService.validateSeatCount(plan, seatCount);

    const priceIds = await getOrCreateStripePriceIds(plan);
    if (!priceIds) {
      throw AppError.internal(
        `No se pudieron resolver los precios de Stripe para el plan: ${plan}`,
      );
    }

    const org = await Organization.findById(organizationId);
    if (!org) {
      throw AppError.notFound("Organización no encontrada");
    }

    // Guard against double subscription
    if (org.subscription?.stripeSubscriptionId) {
      throw AppError.conflict(
        "La organización ya tiene una suscripción activa. Use el portal de facturación para administrar su suscripción o el endpoint de cambio de plan.",
      );
    }

    // Create or get Stripe customer
    let stripeCustomerId = org.subscription?.stripeCustomerId;
    if (!stripeCustomerId) {
      stripeCustomerId = await this.createStripeCustomer(
        organizationId,
        org.email,
        org.name,
      );
    }

    // Create checkout session with subscription items
    const session = await stripeClient.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [
        {
          price: priceIds.base,
          quantity: 1,
        },
        {
          price: priceIds.seat,
          quantity: seatCount,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        organizationId: organizationId.toString(),
        plan,
        seatCount: seatCount.toString(),
      },
      subscription_data: {
        metadata: {
          organizationId: organizationId.toString(),
          plan,
        },
      },
    });

    logger.info("Checkout session created", {
      organizationId: organizationId.toString(),
      sessionId: session.id,
      plan,
    });

    return session.url ?? "";
  },

  /**
   * Creates a billing portal session for managing subscription.
   */
  async createPortalSession(
    organizationId: Types.ObjectId | string,
    returnUrl: string,
  ): Promise<string> {
    const stripeClient = ensureStripe();

    const org = await Organization.findById(organizationId);
    if (!org?.subscription?.stripeCustomerId) {
      throw AppError.badRequest(
        "La organización no tiene una suscripción activa",
      );
    }

    const session = await stripeClient.billingPortal.sessions.create({
      customer: org.subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    return session.url;
  },

  /**
   * Updates subscription seat quantity.
   */
  async updateSeatQuantity(
    organizationId: Types.ObjectId | string,
    newSeatCount: number,
  ): Promise<void> {
    const stripeClient = ensureStripe();

    const org = await Organization.findById(organizationId);
    if (!org?.subscription?.stripeSubscriptionId) {
      throw AppError.badRequest(
        "La organización no tiene una suscripción activa",
      );
    }

    const plan = (org.subscription.plan ?? "free") as SubscriptionPlan;

    // Validate seat limit using subscriptionTypeService
    await subscriptionTypeService.validateSeatCount(plan, newSeatCount);

    const priceIds = await getOrCreateStripePriceIds(plan);
    if (!priceIds?.seat) {
      throw AppError.internal(
        "Precio por puesto no configurado para este plan",
      );
    }

    // Get subscription and update seat quantity
    const subscription = await stripeClient.subscriptions.retrieve(
      org.subscription.stripeSubscriptionId,
    );

    // Find the seat item
    const seatItem = subscription.items.data.find(
      (item) => item.price.id === priceIds.seat,
    );

    if (!seatItem) {
      throw AppError.internal(
        "Elemento de suscripción de puestos no encontrado",
      );
    }

    await stripeClient.subscriptionItems.update(seatItem.id, {
      quantity: newSeatCount,
    });

    // Update local seat count
    await organizationService.updateSeatCount(organizationId, newSeatCount);

    logger.info("Seat quantity updated", {
      organizationId: organizationId.toString(),
      newSeatCount,
    });
  },

  /**
   * Cancels a subscription.
   */
  async cancelSubscription(
    organizationId: Types.ObjectId | string,
    cancelImmediately: boolean = false,
  ): Promise<void> {
    const stripeClient = ensureStripe();

    const org = await Organization.findById(organizationId);
    if (!org?.subscription?.stripeSubscriptionId) {
      throw AppError.badRequest(
        "La organización no tiene una suscripción activa",
      );
    }

    if (cancelImmediately) {
      await stripeClient.subscriptions.cancel(
        org.subscription.stripeSubscriptionId,
      );

      // Clear all subscription data and set status to cancelled
      await organizationService.clearSubscriptionData(organizationId);
    } else {
      await stripeClient.subscriptions.update(
        org.subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        },
      );

      await organizationService.updateSubscription(organizationId, {
        cancelAtPeriodEnd: true,
      });
    }

    logger.info("Subscription cancellation requested", {
      organizationId: organizationId.toString(),
      cancelImmediately,
    });
  },

  /**
   * Creates a payment intent for one-time charges (e.g., damage invoices).
   */
  async createPaymentIntent(
    organizationId: Types.ObjectId | string,
    amount: number,
    currency: string = "usd",
    metadata: Record<string, string> = {},
  ): Promise<{ clientSecret: string; paymentIntentId: string }> {
    const stripeClient = ensureStripe();

    const org = await Organization.findById(organizationId);
    if (!org?.subscription?.stripeCustomerId) {
      throw AppError.badRequest(
        "La organización no tiene un cliente de Stripe",
      );
    }

    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: Math.round(amount), // Amount in cents
      currency,
      customer: org.subscription.stripeCustomerId,
      metadata: {
        organizationId: organizationId.toString(),
        ...metadata,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret ?? "",
      paymentIntentId: paymentIntent.id,
    };
  },

  /**
   * Verifies and constructs a Stripe webhook event.
   */
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
  ): Stripe.Event {
    const stripeClient = ensureStripe();

    if (!STRIPE_WEBHOOK_SECRET) {
      throw AppError.internal("Secreto del webhook de Stripe no configurado");
    }

    return stripeClient.webhooks.constructEvent(
      payload,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  },

  /**
   * Handles Stripe webhook events.
   * Implements idempotency by checking if event was already processed.
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    // Check for idempotency
    const existingEvent = await BillingEvent.findOne({
      stripeEventId: event.id,
    });
    if (existingEvent?.processed) {
      logger.info("Webhook event already processed", { eventId: event.id });
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await this.handleCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session,
          );
          break;

        case "customer.subscription.created":
        case "customer.subscription.updated":
          await this.handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
          );
          break;

        case "customer.subscription.deleted":
          await this.handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription,
          );
          break;

        case "invoice.paid":
          await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_failed":
          await this.handleInvoicePaymentFailed(
            event.data.object as Stripe.Invoice,
          );
          break;

        case "subscription_schedule.canceled":
        case "subscription_schedule.released":
          await this.handleSubscriptionScheduleCanceled(
            event.data.object as Stripe.SubscriptionSchedule,
          );
          break;

        default:
          logger.info("Unhandled webhook event type", { type: event.type });
      }

      // Mark event as processed
      await BillingEvent.findOneAndUpdate(
        { stripeEventId: event.id },
        {
          $set: {
            processed: true,
            processedAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (err: unknown) {
      logger.error("Error processing webhook event", {
        eventId: event.id,
        error: err,
      });

      // Record the error
      await BillingEvent.findOneAndUpdate(
        { stripeEventId: event.id },
        {
          $set: {
            error: err instanceof Error ? err.message : "Unknown error",
          },
        },
        { upsert: true },
      );

      throw err;
    }
  },

  /**
   * Handles checkout.session.completed event.
   */
  async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const organizationId = session.metadata?.organizationId;
    const plan = session.metadata?.plan as SubscriptionPlan;
    const seatCount = parseInt(session.metadata?.seatCount ?? "1", 10);

    if (!organizationId || !plan) {
      logger.error("Missing metadata in checkout session", {
        sessionId: session.id,
      });
      return;
    }

    await organizationService.updateSubscription(organizationId, {
      plan,
      stripeSubscriptionId: session.subscription as string,
    });

    await organizationService.updateSeatCount(organizationId, seatCount);

    await BillingEvent.create({
      organizationId,
      eventType: "subscription_created",
      stripeEventId: session.id,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: session.subscription as string,
      newPlan: plan,
      seatChange: seatCount,
    });

    logger.info("Checkout completed", { organizationId, plan, seatCount });
  },

  /**
   * Handles subscription updated event.
   */
  async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const organizationId = subscription.metadata?.organizationId;
    if (!organizationId) {
      throw AppError.badRequest(
        "Falta organizationId en los metadatos de la suscripción",
      );
    }

    // Get billing cycle dates from the subscription items
    const currentPeriodStart = subscription.items.data[0]?.current_period_start;
    const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

    await organizationService.updateSubscription(organizationId, {
      stripeSubscriptionId: subscription.id,
      ...(currentPeriodStart && {
        currentPeriodStart: new Date(currentPeriodStart * 1000),
      }),
      ...(currentPeriodEnd && {
        currentPeriodEnd: new Date(currentPeriodEnd * 1000),
      }),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });

    // Check if a pending plan change (downgrade) has taken effect
    const org =
      await Organization.findById(organizationId).select("subscription");
    if (
      org?.subscription?.pendingPlan &&
      org.subscription.pendingPlanEffectiveDate &&
      org.subscription.pendingPlanEffectiveDate <= new Date()
    ) {
      const newPlan = org.subscription.pendingPlan as SubscriptionPlan;
      await organizationService.updateSubscription(organizationId, {
        plan: newPlan,
        pendingPlan: null,
        pendingPlanEffectiveDate: null,
        stripeScheduleId: null,
      });

      await BillingEvent.create({
        organizationId,
        eventType: "plan_downgraded",
        stripeSubscriptionId: subscription.id,
        previousPlan: org.subscription.plan,
        newPlan,
      });

      logger.info("Pending plan downgrade applied", {
        organizationId,
        previousPlan: org.subscription.plan,
        newPlan,
      });
    }

    // Reactivate if subscription becomes active again
    if (subscription.status === "active") {
      await organizationService.reactivate(organizationId);
    }

    logger.info("Subscription updated", {
      organizationId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  },

  /**
   * Handles subscription deleted event.
   */
  async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const organizationId = subscription.metadata?.organizationId;
    if (!organizationId) {
      throw AppError.badRequest(
        "Falta organizationId en los metadatos de la suscripción",
      );
    }

    // Clear all Stripe subscription data and set org to cancelled/free
    await organizationService.clearSubscriptionData(organizationId);

    await BillingEvent.create({
      organizationId,
      eventType: "subscription_cancelled",
      stripeSubscriptionId: subscription.id,
    });

    logger.info("Subscription deleted", {
      organizationId,
      subscriptionId: subscription.id,
    });
  },

  /**
   * Handles invoice.paid event.
   */
  async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const org = await organizationService.findByStripeCustomerId(
      invoice.customer as string,
    );
    if (!org) {
      throw AppError.notFound(
        "Organización no encontrada para el cliente de Stripe",
      );
    }

    await BillingEvent.create({
      organizationId: org._id,
      eventType: "payment_succeeded",
      stripeInvoiceId: invoice.id,
      stripeCustomerId: invoice.customer as string,
      amount: invoice.amount_paid,
      currency: invoice.currency,
    });

    // Reactivate if suspended
    if (org.status === "suspended") {
      await organizationService.reactivate(org._id);
    }

    logger.info("Invoice paid", {
      organizationId: org._id.toString(),
      invoiceId: invoice.id,
      amount: invoice.amount_paid,
    });
  },

  /**
   * Handles invoice.payment_failed event.
   */
  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const org = await organizationService.findByStripeCustomerId(
      invoice.customer as string,
    );
    if (!org) {
      throw AppError.notFound(
        "Organización no encontrada para el cliente de Stripe",
      );
    }

    await BillingEvent.create({
      organizationId: org._id,
      eventType: "payment_failed",
      stripeInvoiceId: invoice.id,
      stripeCustomerId: invoice.customer as string,
      amount: invoice.amount_due,
      currency: invoice.currency,
    });

    // Suspend organization after payment failure
    await organizationService.suspend(org._id);

    logger.info("Invoice payment failed, organization suspended", {
      organizationId: org._id.toString(),
      invoiceId: invoice.id,
    });
  },

  /**
   * Gets billing history for an organization.
   */
  async getBillingHistory(
    organizationId: Types.ObjectId | string,
    limit: number = 50,
  ): Promise<InstanceType<typeof BillingEvent>[]> {
    return BillingEvent.find({ organizationId })
      .sort({ createdAt: -1 })
      .limit(limit);
  },

  /**
   * Handles subscription_schedule.canceled / released events.
   * Clears pending plan change data when a schedule is canceled or released externally.
   */
  async handleSubscriptionScheduleCanceled(
    schedule: Stripe.SubscriptionSchedule,
  ): Promise<void> {
    const subscriptionId =
      typeof schedule.subscription === "string"
        ? schedule.subscription
        : schedule.subscription?.id;

    if (!subscriptionId) {
      logger.warn("Schedule canceled/released without subscription reference", {
        scheduleId: schedule.id,
      });
      return;
    }

    const org = await Organization.findOne({
      "subscription.stripeScheduleId": schedule.id,
    });
    if (!org) {
      logger.info("No org found for canceled/released schedule", {
        scheduleId: schedule.id,
      });
      return;
    }

    await organizationService.updateSubscription(org._id, {
      pendingPlan: null,
      pendingPlanEffectiveDate: null,
      stripeScheduleId: null,
    });

    logger.info("Pending plan change cleared (schedule canceled/released)", {
      organizationId: org._id.toString(),
      scheduleId: schedule.id,
    });
  },

  /**
   * Changes the subscription plan for an organization.
   * Upgrades are applied immediately with Stripe proration.
   * Downgrades are deferred to the end of the billing period via Subscription Schedules.
   */
  async changePlan(
    organizationId: Types.ObjectId | string,
    newPlan: SubscriptionPlan,
    seatCount?: number,
  ): Promise<{
    type: "upgrade" | "downgrade";
    effectiveDate: Date | "immediate";
    previousPlan: string;
    newPlan: string;
    prorationAmount?: number;
  }> {
    const stripeClient = ensureStripe();

    const org = await Organization.findById(organizationId);
    if (!org) {
      throw AppError.notFound("Organización no encontrada");
    }

    if (!org.subscription?.stripeSubscriptionId) {
      throw AppError.badRequest(
        "La organización no tiene una suscripción activa",
      );
    }

    const currentPlan = (org.subscription.plan ?? "free") as SubscriptionPlan;

    if (currentPlan === newPlan) {
      // Same plan but potentially different seat count
      if (seatCount && seatCount !== org.subscription.seatCount) {
        await this.updateSeatQuantity(organizationId, seatCount);
        return {
          type: "upgrade",
          effectiveDate: "immediate",
          previousPlan: currentPlan,
          newPlan,
        };
      }
      throw AppError.badRequest("Ya estás en este plan");
    }

    // Validate new plan
    const newPlanValid = await subscriptionTypeService.planExists(newPlan);
    if (!newPlanValid) {
      throw AppError.badRequest(
        `El plan '${newPlan}' no existe o no está activo`,
      );
    }

    const effectiveSeatCount = seatCount ?? org.subscription.seatCount ?? 1;
    await subscriptionTypeService.validateSeatCount(
      newPlan,
      effectiveSeatCount,
    );

    // Calculate costs to determine direction
    const currentCost = await subscriptionTypeService.calculateCost(
      currentPlan,
      org.subscription.seatCount ?? 1,
    );
    const newCost = await subscriptionTypeService.calculateCost(
      newPlan,
      effectiveSeatCount,
    );

    const isUpgrade = newCost.totalCost > currentCost.totalCost;

    const newPriceIds = await getOrCreateStripePriceIds(newPlan);
    if (!newPriceIds) {
      throw AppError.internal(
        `No se pudieron resolver los precios de Stripe para el plan: ${newPlan}`,
      );
    }

    if (isUpgrade) {
      // Immediate upgrade with Stripe proration
      const subscription = await stripeClient.subscriptions.retrieve(
        org.subscription.stripeSubscriptionId,
      );

      // Replace all items with new plan prices
      const existingItems = subscription.items.data;
      const items: Stripe.SubscriptionUpdateParams.Item[] = [
        // Remove existing items
        ...existingItems.map((item) => ({
          id: item.id,
          deleted: true as const,
        })),
        // Add new plan items
        { price: newPriceIds.base, quantity: 1 },
        { price: newPriceIds.seat, quantity: effectiveSeatCount },
      ];

      await stripeClient.subscriptions.update(
        org.subscription.stripeSubscriptionId,
        {
          items,
          proration_behavior: "always_invoice",
          metadata: {
            organizationId: organizationId.toString(),
            plan: newPlan,
          },
        },
      );

      // Update org immediately
      await organizationService.updateSubscription(organizationId, {
        plan: newPlan,
        pendingPlan: null,
        pendingPlanEffectiveDate: null,
        stripeScheduleId: null,
      });
      await organizationService.updateSeatCount(
        organizationId,
        effectiveSeatCount,
      );

      await BillingEvent.create({
        organizationId,
        eventType: "plan_upgraded",
        stripeSubscriptionId: org.subscription.stripeSubscriptionId,
        previousPlan: currentPlan,
        newPlan,
        seatChange: effectiveSeatCount,
      });

      logger.info("Plan upgraded", {
        organizationId: organizationId.toString(),
        previousPlan: currentPlan,
        newPlan,
      });

      return {
        type: "upgrade",
        effectiveDate: "immediate",
        previousPlan: currentPlan,
        newPlan,
      };
    } else {
      // Deferred downgrade via Subscription Schedule
      if (org.subscription.stripeScheduleId) {
        // Cancel existing schedule first
        try {
          await stripeClient.subscriptionSchedules.release(
            org.subscription.stripeScheduleId,
          );
        } catch (err) {
          logger.warn("Failed to release existing schedule", {
            scheduleId: org.subscription.stripeScheduleId,
            error: err,
          });
        }
      }

      // Create schedule from existing subscription
      const schedule = await stripeClient.subscriptionSchedules.create({
        from_subscription: org.subscription.stripeSubscriptionId,
      });

      // Get current subscription for phase details
      const subscription = await stripeClient.subscriptions.retrieve(
        org.subscription.stripeSubscriptionId,
      );

      const currentPhaseEnd = subscription.items.data[0]?.current_period_end;
      const currentPhaseStart =
        subscription.items.data[0]?.current_period_start;
      if (!currentPhaseEnd || !currentPhaseStart) {
        throw AppError.internal(
          "No se pudo determinar el período actual de la suscripción",
        );
      }

      // Update schedule with two phases: current (keep as-is) + new (downgraded plan)
      await stripeClient.subscriptionSchedules.update(schedule.id, {
        phases: [
          {
            items: subscription.items.data.map((item) => ({
              price: item.price.id,
              quantity: item.quantity ?? 1,
            })),
            start_date: currentPhaseStart,
            end_date: currentPhaseEnd,
          },
          {
            items: [
              { price: newPriceIds.base, quantity: 1 },
              { price: newPriceIds.seat, quantity: effectiveSeatCount },
            ],
            metadata: {
              organizationId: organizationId.toString(),
              plan: newPlan,
            },
          },
        ],
      });

      const effectiveDate = new Date(currentPhaseEnd * 1000);

      // Store pending change in org
      await organizationService.updateSubscription(organizationId, {
        pendingPlan: newPlan,
        pendingPlanEffectiveDate: effectiveDate,
        stripeScheduleId: schedule.id,
      });

      await BillingEvent.create({
        organizationId,
        eventType: "plan_downgraded",
        stripeSubscriptionId: org.subscription.stripeSubscriptionId,
        previousPlan: currentPlan,
        newPlan,
        metadata: {
          effectiveDate: effectiveDate.toISOString(),
          scheduleId: schedule.id,
          deferred: true,
        },
      });

      logger.info("Plan downgrade scheduled", {
        organizationId: organizationId.toString(),
        previousPlan: currentPlan,
        newPlan,
        effectiveDate,
        scheduleId: schedule.id,
      });

      return {
        type: "downgrade",
        effectiveDate,
        previousPlan: currentPlan,
        newPlan,
      };
    }
  },

  /**
   * Cancels a pending plan change (deferred downgrade).
   * Releases the Stripe Subscription Schedule, keeping the current subscription as-is.
   */
  async cancelPendingPlanChange(
    organizationId: Types.ObjectId | string,
  ): Promise<void> {
    const stripeClient = ensureStripe();

    const org = await Organization.findById(organizationId);
    if (!org) {
      throw AppError.notFound("Organización no encontrada");
    }

    if (!org.subscription?.stripeScheduleId) {
      throw AppError.badRequest(
        "No hay un cambio de plan pendiente para cancelar",
      );
    }

    // Release the schedule — keeps current subscription as-is
    await stripeClient.subscriptionSchedules.release(
      org.subscription.stripeScheduleId,
    );

    // Clear pending fields
    await organizationService.updateSubscription(organizationId, {
      pendingPlan: null,
      pendingPlanEffectiveDate: null,
      stripeScheduleId: null,
    });

    logger.info("Pending plan change canceled", {
      organizationId: organizationId.toString(),
      previousPendingPlan: org.subscription.pendingPlan,
    });
  },

  /**
   * Gets pending plan change information for an organization.
   */
  async getPendingPlanChange(organizationId: Types.ObjectId | string): Promise<{
    pendingPlan: string;
    effectiveDate: Date;
  } | null> {
    const org =
      await Organization.findById(organizationId).select("subscription");
    if (!org) {
      throw AppError.notFound("Organización no encontrada");
    }

    if (
      !org.subscription?.pendingPlan ||
      !org.subscription?.pendingPlanEffectiveDate
    ) {
      return null;
    }

    return {
      pendingPlan: org.subscription.pendingPlan,
      effectiveDate: org.subscription.pendingPlanEffectiveDate,
    };
  },
};

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { billingService } from "../modules/billing/billing.service.ts";
import { validateBody } from "../middleware/validation.ts";
import {
  paymentRateLimiter,
  webhookRateLimiter,
} from "../middleware/rate_limiter.ts";
import {
  authenticate,
  requireActiveOrganization,
  requireOwner,
  getOrgId,
} from "../middleware/auth.ts";
import { AppError } from "../errors/AppError.ts";
import type { SubscriptionPlan } from "../modules/organization/models/organization.model.ts";

const billingRouter = Router();

/* ---------- Validation Schemas ---------- */

const createCheckoutSchema = z.object({
  plan: z.enum(["starter", "professional", "enterprise"]),
  seatCount: z.number().int().positive().default(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const updateSeatsSchema = z.object({
  seatCount: z.number().int().positive(),
});

const cancelSubscriptionSchema = z.object({
  cancelImmediately: z.boolean().default(false),
});

const createPortalSchema = z.object({
  returnUrl: z.string().url(),
});

/* ---------- Authenticated Routes ---------- */

/**
 * POST /api/v1/billing/checkout
 * Creates a Stripe Checkout session for subscription.
 */
billingRouter.post(
  "/checkout",
  authenticate,
  requireOwner,
  paymentRateLimiter,
  validateBody(createCheckoutSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { plan, seatCount, successUrl, cancelUrl } = req.body;

      const checkoutUrl = await billingService.createCheckoutSession(
        getOrgId(req),
        plan as SubscriptionPlan,
        seatCount,
        successUrl,
        cancelUrl,
      );

      res.json({
        status: "success",
        data: { checkoutUrl },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/billing/portal
 * Creates a Stripe Billing Portal session.
 */
billingRouter.post(
  "/portal",
  authenticate,
  requireOwner,
  validateBody(createPortalSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { returnUrl } = req.body;

      const portalUrl = await billingService.createPortalSession(
        getOrgId(req),
        returnUrl,
      );

      res.json({
        status: "success",
        data: { portalUrl },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/billing/seats
 * Updates the subscription seat quantity.
 */
billingRouter.patch(
  "/seats",
  authenticate,
  requireActiveOrganization,
  requireOwner,
  paymentRateLimiter,
  validateBody(updateSeatsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await billingService.updateSeatQuantity(
        getOrgId(req),
        req.body.seatCount,
      );

      res.json({
        status: "success",
        message: "Seat quantity updated successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/billing/cancel
 * Cancels the subscription.
 */
billingRouter.post(
  "/cancel",
  authenticate,
  requireOwner,
  validateBody(cancelSubscriptionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await billingService.cancelSubscription(
        getOrgId(req),
        req.body.cancelImmediately,
      );

      res.json({
        status: "success",
        message: req.body.cancelImmediately
          ? "Subscription cancelled immediately"
          : "Subscription will be cancelled at the end of the billing period",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/billing/history
 * Gets billing history for the organization.
 */
billingRouter.get(
  "/history",
  authenticate,
  requireOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const history = await billingService.getBillingHistory(
        getOrgId(req),
        limit,
      );

      res.json({
        status: "success",
        data: { history },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/billing/webhook
 * Handles Stripe webhook events.
 * This endpoint MUST receive raw body (configured in server.ts).
 */
billingRouter.post(
  "/webhook",
  webhookRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers["stripe-signature"] as string;

      if (!signature) {
        throw AppError.badRequest("Missing Stripe signature");
      }

      // req.body should be raw buffer when configured correctly
      const event = billingService.constructWebhookEvent(req.body, signature);

      await billingService.handleWebhookEvent(event);

      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  },
);

export default billingRouter;

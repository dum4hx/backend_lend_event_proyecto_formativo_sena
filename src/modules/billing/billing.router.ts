import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { billingService } from "./billing.service.ts";
import { validateBody } from "../../middleware/validation.ts";
import {
  paymentRateLimiter,
  webhookRateLimiter,
} from "../../middleware/rate_limiter.ts";
import {
  authenticate,
  requireActiveOrganization,
  getOrgId,
  requirePermission,
} from "../../middleware/auth.ts";
import { AppError } from "../../errors/AppError.ts";
import type { SubscriptionPlan } from "../organization/models/organization.model.ts";

const billingRouter = Router();

/* ---------- Validation Schemas ---------- */

const createCheckoutSchema = z.object({
  plan: z.string().min(1, "El plan es requerido").max(50).trim().toLowerCase(),
  seatCount: z
    .number()
    .int()
    .min(1, "El número de asientos debe ser al menos 1")
    .default(1),
  successUrl: z.url(),
  cancelUrl: z.url(),
});

const updateSeatsSchema = z.object({
  seatCount: z.number().int().positive(),
});

const cancelSubscriptionSchema = z.object({
  cancelImmediately: z.boolean().default(false),
});

const createPortalSchema = z.object({
  returnUrl: z.url(),
});

const changePlanSchema = z.object({
  plan: z.string().min(1, "El plan es requerido").max(50).trim().toLowerCase(),
  seatCount: z
    .number()
    .int()
    .min(1, "El número de asientos debe ser al menos 1")
    .optional(),
});

/* ---------- Authenticated Routes ---------- */

/**
 * POST /api/v1/billing/checkout
 * Creates a Stripe Checkout session for subscription.
 */
billingRouter.post(
  "/checkout",
  authenticate,
  requirePermission("billing:manage"),
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
  requirePermission("billing:manage"),
  paymentRateLimiter,
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
  requirePermission("billing:manage"),
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
        message: "Cantidad de asientos actualizada exitosamente",
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
  requirePermission("billing:manage"),
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
          ? "Suscripción cancelada inmediatamente"
          : "La suscripción se cancelará al final del período de facturación",
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
  requirePermission("billing:manage"),
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
 * POST /api/v1/billing/change-plan
 * Changes the subscription plan (upgrade or downgrade).
 * Upgrades are applied immediately with Stripe proration.
 * Downgrades are deferred to the end of the billing period.
 * Requires billing:manage permission.
 */
billingRouter.post(
  "/change-plan",
  authenticate,
  requireActiveOrganization,
  requirePermission("billing:manage"),
  paymentRateLimiter,
  validateBody(changePlanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { plan, seatCount } = req.body;

      const result = await billingService.changePlan(
        getOrgId(req),
        plan as SubscriptionPlan,
        seatCount,
      );

      res.json({
        status: "success",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/billing/pending-changes
 * Gets pending plan change information.
 * Requires billing:manage permission.
 */
billingRouter.get(
  "/pending-changes",
  authenticate,
  requirePermission("billing:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pendingChange = await billingService.getPendingPlanChange(
        getOrgId(req),
      );

      res.json({
        status: "success",
        data: { pendingChange },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/billing/pending-changes
 * Cancels a pending plan change (deferred downgrade).
 * Requires billing:manage permission.
 */
billingRouter.delete(
  "/pending-changes",
  authenticate,
  requirePermission("billing:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await billingService.cancelPendingPlanChange(getOrgId(req));

      res.json({
        status: "success",
        message: "Cambio de plan pendiente cancelado exitosamente",
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
        throw AppError.badRequest("Firma de Stripe no encontrada");
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

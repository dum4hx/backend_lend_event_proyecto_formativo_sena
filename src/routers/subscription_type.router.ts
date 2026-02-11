import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  subscriptionTypeService,
  type PlanLimits,
} from "../modules/subscription_type/subscription_type.service.ts";
import {
  SubscriptionTypeZodSchema,
  SubscriptionTypeUpdateZodSchema,
  billingModelOptions,
  subscriptionTypeStatusOptions,
} from "../modules/subscription_type/models/subscription_type.model.ts";
import { validateBody } from "../middleware/validation.ts";
import { authenticate, requireRole } from "../middleware/auth.ts";

const subscriptionTypeRouter = Router();

/* ---------- Public Routes ---------- */

/**
 * GET /api/v1/subscription-types
 * Lists all active subscription types (public).
 */
subscriptionTypeRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plans = await subscriptionTypeService.getAllPlanLimitsArray();

      res.json({
        status: "success",
        data: {
          subscriptionTypes: plans.map((plan) => ({
            plan: plan.plan,
            displayName: plan.displayName,
            billingModel: plan.billingModel,
            maxCatalogItems: plan.maxCatalogItems,
            maxSeats: plan.maxSeats,
            features: plan.features,
            // Convert cents to dollars for display
            basePriceMonthly: plan.baseCost / 100,
            pricePerSeat: plan.pricePerSeat / 100,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/subscription-types/:plan
 * Gets a specific subscription type by plan name (public).
 */
subscriptionTypeRouter.get(
  "/:plan",
  async (req: Request<{ plan: string }>, res: Response, next: NextFunction) => {
    try {
      const { plan } = req.params;
      const limits = await subscriptionTypeService.getPlanLimits(plan);

      res.json({
        status: "success",
        data: {
          subscriptionType: {
            plan: limits.plan,
            displayName: limits.displayName,
            billingModel: limits.billingModel,
            maxCatalogItems: limits.maxCatalogItems,
            maxSeats: limits.maxSeats,
            features: limits.features,
            basePriceMonthly: limits.baseCost / 100,
            pricePerSeat: limits.pricePerSeat / 100,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Super Admin Routes ---------- */

// All routes below require super_admin role
subscriptionTypeRouter.use(authenticate, requireRole("super_admin"));

/**
 * GET /api/v1/subscription-types/admin/all
 * Lists all subscription types including inactive (super admin only).
 */
subscriptionTypeRouter.get(
  "/admin/all",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscriptionTypes = await subscriptionTypeService.findAll(true);

      res.json({
        status: "success",
        data: { subscriptionTypes },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/subscription-types
 * Creates a new subscription type (super admin only).
 */
subscriptionTypeRouter.post(
  "/",
  validateBody(SubscriptionTypeZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscriptionType = await subscriptionTypeService.create(req.body);

      res.status(201).json({
        status: "success",
        data: { subscriptionType },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/subscription-types/:plan
 * Updates a subscription type (super admin only).
 */
subscriptionTypeRouter.patch(
  "/:plan",
  validateBody(SubscriptionTypeUpdateZodSchema),
  async (req: Request<{ plan: string }>, res: Response, next: NextFunction) => {
    try {
      const { plan } = req.params;
      const subscriptionType = await subscriptionTypeService.update(
        plan,
        req.body,
      );

      res.json({
        status: "success",
        data: { subscriptionType },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/subscription-types/:plan
 * Deactivates a subscription type (super admin only).
 * Note: This is a soft delete - sets status to 'inactive'.
 */
subscriptionTypeRouter.delete(
  "/:plan",
  async (req: Request<{ plan: string }>, res: Response, next: NextFunction) => {
    try {
      const { plan } = req.params;
      await subscriptionTypeService.deactivate(plan);

      res.json({
        status: "success",
        message: `Subscription type "${plan}" has been deactivated`,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/subscription-types/:plan/calculate-cost
 * Calculates the cost for a plan with a given seat count (public utility).
 */
subscriptionTypeRouter.post(
  "/:plan/calculate-cost",
  validateBody(z.object({ seatCount: z.number().int().positive() })),
  async (req: Request<{ plan: string }>, res: Response, next: NextFunction) => {
    try {
      const { plan } = req.params;
      const { seatCount } = req.body;

      const cost = await subscriptionTypeService.calculateCost(plan, seatCount);

      res.json({
        status: "success",
        data: {
          plan,
          seatCount,
          baseCost: cost.baseCost / 100,
          seatCost: cost.seatCost / 100,
          totalCost: cost.totalCost / 100,
          currency: "usd",
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default subscriptionTypeRouter;

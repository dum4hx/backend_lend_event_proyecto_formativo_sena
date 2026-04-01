import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { organizationService } from "./organization.service.ts";
import {
  OrganizationUpdateZodSchema,
  OrganizationSettingsZodSchema,
} from "./models/organization.model.ts";
import { subscriptionTypeService } from "../subscription_type/subscription_type.service.ts";
import { validateBody } from "../../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
} from "../../middleware/auth.ts";

const organizationRouter = Router();

// All routes require authentication
organizationRouter.use(authenticate);

/* ---------- Routes ---------- */

/**
 * GET /api/v1/organizations
 * Gets the current organization's details.
 */
organizationRouter.get(
  "/",
  requirePermission("organization:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organization = await organizationService.findById(getOrgId(req));

      res.json({
        status: "success",
        data: { organization },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/organizations
 * Updates the organization's details.
 */
organizationRouter.patch(
  "/",
  requirePermission("organization:update"),
  validateBody(OrganizationUpdateZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organization = await organizationService.update(
        getOrgId(req),
        req.body,
      );

      res.json({
        status: "success",
        data: { organization },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/organizations/usage
 * Gets the current plan usage and limits.
 */
organizationRouter.get(
  "/usage",
  requirePermission("organization:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usage = await organizationService.getPlanUsage(getOrgId(req));

      res.json({
        status: "success",
        data: { usage },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/organizations/settings
 * Gets the current organization settings.
 */
organizationRouter.get(
  "/settings",
  requirePermission("organization:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await organizationService.getSettings(getOrgId(req));

      res.json({
        status: "success",
        data: { settings },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/organizations/settings
 * Updates organization settings (policies). Owner only.
 */
organizationRouter.patch(
  "/settings",
  requirePermission("organization:update"),
  validateBody(OrganizationSettingsZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await organizationService.updateSettings(
        getOrgId(req),
        req.body,
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
 * GET /api/v1/organizations/plans
 * Gets available subscription plans and their limits.
 */
organizationRouter.get(
  "/plans",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plans = await subscriptionTypeService.getAllPlanLimitsArray();

      res.json({
        status: "success",
        data: {
          plans: plans.map((plan) => ({
            name: plan.plan,
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

export default organizationRouter;

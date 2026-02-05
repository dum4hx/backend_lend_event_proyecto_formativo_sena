import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { organizationService } from "../modules/organization/organization.service.ts";
import {
  OrganizationUpdateZodSchema,
  planLimits,
} from "../modules/organization/models/organization.model.ts";
import { validateBody } from "../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
} from "../middleware/auth.ts";

const organizationRouter = Router();

// All routes require authentication
organizationRouter.use(authenticate);

/* ---------- Routes ---------- */

/**
 * GET /api/v1/organization
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
 * PATCH /api/v1/organization
 * Updates the organization's details.
 */
organizationRouter.patch(
  "/",
  requireActiveOrganization,
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
 * GET /api/v1/organization/usage
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
 * GET /api/v1/organization/plans
 * Gets available subscription plans and their limits.
 */
organizationRouter.get("/plans", (req: Request, res: Response) => {
  res.json({
    status: "success",
    data: {
      plans: Object.entries(planLimits).map(([name, limits]) => ({
        name,
        ...limits,
        // Convert cents to dollars for display
        basePriceMonthly: limits.basePriceMonthly / 100,
        pricePerSeat: limits.pricePerSeat / 100,
      })),
    },
  });
});

export default organizationRouter;

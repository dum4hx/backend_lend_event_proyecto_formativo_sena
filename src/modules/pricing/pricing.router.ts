import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  PricingConfigCreateZodSchema,
  PricingConfigUpdateZodSchema,
  PricingPreviewZodSchema,
} from "./models/pricing_config.model.ts";
import { pricingService } from "./pricing.service.ts";
import { validateBody, validateQuery } from "../../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
} from "../../middleware/auth.ts";

const pricingRouter = Router();

// All routes require authentication and an active organization
pricingRouter.use(authenticate, requireActiveOrganization);

/* ---------- Routes ---------- */

/**
 * GET /api/v1/pricing/configs
 * Lists all pricing configurations for the organization.
 * Requires: pricing:read
 */
pricingRouter.get(
  "/configs",
  requirePermission("pricing:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const configs = await pricingService.listPricingConfigs(organizationId);
      res.json({ status: "success", data: { configs } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/pricing/configs
 * Creates a new pricing configuration for the organization.
 * Requires: pricing:manage
 */
pricingRouter.post(
  "/configs",
  requirePermission("pricing:manage"),
  validateBody(PricingConfigCreateZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const config = await pricingService.createPricingConfig(
        organizationId,
        req.body,
      );
      res.status(201).json({ status: "success", data: { config } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/pricing/configs/:id
 * Gets a single pricing configuration by ID.
 * Requires: pricing:read
 */
pricingRouter.get(
  "/configs/:id",
  requirePermission("pricing:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const config = await pricingService.getPricingConfigById(
        organizationId,
        req.params["id"] as string,
      );
      res.json({ status: "success", data: { config } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /api/v1/pricing/configs/:id
 * Updates an existing pricing configuration.
 * Requires: pricing:manage
 */
pricingRouter.put(
  "/configs/:id",
  requirePermission("pricing:manage"),
  validateBody(PricingConfigUpdateZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const config = await pricingService.updatePricingConfig(
        organizationId,
        req.params["id"] as string,
        req.body,
      );
      res.json({ status: "success", data: { config } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/pricing/configs/:id
 * Deletes a pricing configuration.
 * The org-level default config cannot be deleted.
 * Requires: pricing:manage
 */
pricingRouter.delete(
  "/configs/:id",
  requirePermission("pricing:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      await pricingService.deletePricingConfig(
        organizationId,
        req.params["id"] as string,
      );
      res.json({
        status: "success",
        data: { message: "Pricing config deleted successfully" },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/pricing/preview
 * Previews the calculated price for a given material type or package,
 * quantity, and duration — without creating anything.
 * Requires: pricing:read
 */
pricingRouter.post(
  "/preview",
  requirePermission("pricing:read"),
  validateBody(PricingPreviewZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const { itemType, referenceId, quantity, durationInDays } = req.body;

      const result = await pricingService.previewPrice(
        organizationId,
        itemType,
        referenceId,
        quantity,
        durationInDays,
      );

      res.json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default pricingRouter;

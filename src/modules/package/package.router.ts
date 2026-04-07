import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { PackageZodSchema } from "./models/package.model.ts";
import { packageService } from "./package.service.ts";
import {
  validateBody,
  validateQuery,
  paginationSchema,
} from "../../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
} from "../../middleware/auth.ts";
import { AppError } from "../../errors/AppError.ts";

const packageRouter = Router();

// All routes require authentication and active organization
packageRouter.use(authenticate, requireActiveOrganization);

/* ---------- Validation Schemas ---------- */

const listPackagesQuerySchema = paginationSchema.extend({
  isActive: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
  search: z.string().optional(),
});

const packageUpdateSchema = PackageZodSchema.partial();

const packageAvailabilityQuerySchema = z.object({
  startDate: z.coerce.date({ message: "La fecha de inicio es requerida" }),
  endDate: z.coerce.date({ message: "La fecha de fin es requerida" }),
}).refine((data) => data.endDate > data.startDate, {
  message: "La fecha de fin debe ser posterior a la fecha de inicio",
  path: ["endDate"],
});

/* ---------- Routes ---------- */

/**
 * GET /api/v1/packages
 * Lists all packages in the organization.
 */
packageRouter.get(
  "/",
  requirePermission("packages:read"),
  validateQuery(listPackagesQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const {
        page = 1,
        limit = 20,
        isActive,
        search,
      } = req.query as unknown as z.infer<typeof listPackagesQuerySchema>;
      const skip = (page - 1) * limit;

      const query: Record<string, unknown> = { organizationId };

      if (typeof isActive === "boolean") {
        query.isActive = isActive;
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const result = await packageService.listPackages(
        { page, limit, isActive, search },
        organizationId,
      );

      res.json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/packages/:id
 * Gets a specific package by ID.
 */
packageRouter.get(
  "/:id",
  requirePermission("packages:read"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const pkg = await packageService.getPackage(req.params.id, getOrgId(req));

      res.json({ status: "success", data: { package: pkg } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/packages
 * Creates a new package.
 */
packageRouter.post(
  "/",
  requirePermission("packages:create"),
  validateBody(PackageZodSchema.omit({ organizationId: true })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);

      const pkg = await packageService.createPackage(organizationId, req.body);

      res.status(201).json({ status: "success", data: { package: pkg } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/packages/:id/availability
 * Returns available instances for each material type in the package,
 * filtered by a date range. Useful for checking if a package can be
 * fulfilled before creating a loan request.
 */
packageRouter.get(
  "/:id/availability",
  requirePermission("packages:read"),
  validateQuery(packageAvailabilityQuerySchema),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { startDate, endDate } = req.query as unknown as {
        startDate: Date;
        endDate: Date;
      };

      const data = await packageService.getPackageAvailability(
        getOrgId(req),
        req.params.id,
        new Date(startDate),
        new Date(endDate),
      );

      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/packages/:id
 * Updates a package.
 */
packageRouter.patch(
  "/:id",
  requirePermission("packages:update"),
  validateBody(packageUpdateSchema.omit({ organizationId: true })),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);

      const pkg = await packageService.updatePackage(organizationId, req.params.id, req.body);

      res.json({ status: "success", data: { package: pkg } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/packages/:id/activate
 * Activates a package.
 */
packageRouter.post(
  "/:id/activate",
  requirePermission("packages:update"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const pkg = await packageService.activatePackage(getOrgId(req), req.params.id);

      res.json({ status: "success", data: { package: pkg }, message: "Paquete activado exitosamente" });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/packages/:id/deactivate
 * Deactivates a package.
 */
packageRouter.post(
  "/:id/deactivate",
  requirePermission("packages:update"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const pkg = await packageService.deactivatePackage(getOrgId(req), req.params.id);

      res.json({ status: "success", data: { package: pkg }, message: "Paquete desactivado exitosamente" });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/packages/:id
 * Deletes a package.
 */
packageRouter.delete(
  "/:id",
  requirePermission("packages:delete"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      await packageService.deletePackage(getOrgId(req), req.params.id);

      res.json({ status: "success", message: "Paquete eliminado exitosamente" });
    } catch (err) {
      next(err);
    }
  },
);

export default packageRouter;

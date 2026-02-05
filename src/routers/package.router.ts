import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  Package,
  PackageZodSchema,
} from "../modules/package/models/package.model.ts";
import { MaterialModel } from "../modules/material/models/material_type.model.ts";
import { organizationService } from "../modules/organization/organization.service.ts";
import {
  validateBody,
  validateQuery,
  paginationSchema,
} from "../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
} from "../middleware/auth.ts";
import { AppError } from "../errors/AppError.ts";

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

      const [packages, total] = await Promise.all([
        Package.find(query)
          .skip(skip)
          .limit(limit)
          .populate("materialTypes.materialTypeId", "name pricePerDay")
          .sort({ createdAt: -1 }),
        Package.countDocuments(query),
      ]);

      res.json({
        status: "success",
        data: {
          packages,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      });
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pkg = await Package.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
      }).populate(
        "materialTypes.materialTypeId",
        "name description pricePerDay categoryId",
      );

      if (!pkg) {
        throw AppError.notFound("Package not found");
      }

      res.json({
        status: "success",
        data: { package: pkg },
      });
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

      // Validate that all material types exist
      const materialTypeIds = req.body.materialTypes.map(
        (mt: { materialTypeId: string }) => mt.materialTypeId,
      );

      const existingTypes = await MaterialModel.find({
        _id: { $in: materialTypeIds },
      });

      if (existingTypes.length !== materialTypeIds.length) {
        throw AppError.badRequest("One or more material types not found");
      }

      // Check if package with same name exists
      const existing = await Package.findOne({
        organizationId,
        name: req.body.name,
      });

      if (existing) {
        throw AppError.conflict("A package with this name already exists");
      }

      const pkg = await Package.create({
        ...req.body,
        organizationId,
      });

      res.status(201).json({
        status: "success",
        data: { package: pkg },
      });
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);

      // If materialTypes are being updated, validate them
      if (req.body.materialTypes) {
        const materialTypeIds = req.body.materialTypes.map(
          (mt: { materialTypeId: string }) => mt.materialTypeId,
        );

        const existingTypes = await MaterialModel.find({
          _id: { $in: materialTypeIds },
        });

        if (existingTypes.length !== materialTypeIds.length) {
          throw AppError.badRequest("One or more material types not found");
        }
      }

      const pkg = await Package.findOneAndUpdate(
        { _id: req.params.id, organizationId },
        { $set: req.body },
        { new: true, runValidators: true },
      );

      if (!pkg) {
        throw AppError.notFound("Package not found");
      }

      res.json({
        status: "success",
        data: { package: pkg },
      });
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pkg = await Package.findOneAndUpdate(
        { _id: req.params.id, organizationId: getOrgId(req) },
        { $set: { isActive: true } },
        { new: true },
      );

      if (!pkg) {
        throw AppError.notFound("Package not found");
      }

      res.json({
        status: "success",
        data: { package: pkg },
        message: "Package activated successfully",
      });
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pkg = await Package.findOneAndUpdate(
        { _id: req.params.id, organizationId: getOrgId(req) },
        { $set: { isActive: false } },
        { new: true },
      );

      if (!pkg) {
        throw AppError.notFound("Package not found");
      }

      res.json({
        status: "success",
        data: { package: pkg },
        message: "Package deactivated successfully",
      });
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if package is used in any requests
      const { LoanRequest } =
        await import("../modules/request/models/request.model.ts");
      const activeRequests = await LoanRequest.countDocuments({
        packageId: req.params.id,
        status: { $in: ["pending", "approved", "assigned", "ready"] },
      });

      if (activeRequests > 0) {
        throw AppError.badRequest("Cannot delete package with active requests");
      }

      const pkg = await Package.findOneAndDelete({
        _id: req.params.id,
        organizationId: getOrgId(req),
      });

      if (!pkg) {
        throw AppError.notFound("Package not found");
      }

      res.json({
        status: "success",
        message: "Package deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default packageRouter;

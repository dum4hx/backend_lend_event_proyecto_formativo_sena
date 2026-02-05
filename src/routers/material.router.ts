import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  MaterialModel,
  MaterialModelZodSchema,
} from "../modules/material/models/material_type.model.ts";
import {
  MaterialInstance,
  MaterialInstanceZodSchema,
} from "../modules/material/models/material_instance.model.ts";
import {
  Category,
  CategoryZodSchema,
} from "../modules/material/models/category.model.ts";
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

const materialRouter = Router();

// All routes require authentication and active organization
materialRouter.use(authenticate, requireActiveOrganization);

/* ---------- Material Instance Status Options ---------- */

const materialStatusOptions = [
  "available",
  "reserved",
  "loaned",
  "returned",
  "maintenance",
  "damaged",
  "lost",
  "retired",
] as const;

/* ---------- Validation Schemas ---------- */

const listMaterialsQuerySchema = paginationSchema.extend({
  status: z.enum(materialStatusOptions).optional(),
  categoryId: z.string().optional(),
  materialTypeId: z.string().optional(),
  search: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(materialStatusOptions),
  notes: z.string().max(500).optional(),
});

/* ---------- Category Routes ---------- */

/**
 * GET /api/v1/materials/categories
 * Lists all categories.
 */
materialRouter.get(
  "/categories",
  requirePermission("materials:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await Category.find().sort({ name: 1 });

      res.json({
        status: "success",
        data: { categories },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/materials/categories
 * Creates a new category.
 */
materialRouter.post(
  "/categories",
  requirePermission("materials:create"),
  validateBody(CategoryZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await Category.create(req.body);

      res.status(201).json({
        status: "success",
        data: { category },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Material Type (Catalog) Routes ---------- */

/**
 * GET /api/v1/materials/types
 * Lists all material types (catalog items).
 */
materialRouter.get(
  "/types",
  requirePermission("materials:read"),
  validateQuery(
    paginationSchema.extend({
      categoryId: z.string().optional(),
      search: z.string().optional(),
    }),
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = 1, limit = 20, categoryId, search } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const query: Record<string, unknown> = {};

      if (categoryId) {
        query.categoryId = categoryId;
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const [materialTypes, total] = await Promise.all([
        MaterialModel.find(query)
          .skip(skip)
          .limit(Number(limit))
          .populate("categoryId", "name")
          .sort({ name: 1 }),
        MaterialModel.countDocuments(query),
      ]);

      res.json({
        status: "success",
        data: {
          materialTypes,
          total,
          page: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/materials/types/:id
 * Gets a specific material type.
 */
materialRouter.get(
  "/types/:id",
  requirePermission("materials:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const materialType = await MaterialModel.findById(req.params.id).populate(
        "categoryId",
        "name",
      );

      if (!materialType) {
        throw AppError.notFound("Material type not found");
      }

      res.json({
        status: "success",
        data: { materialType },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/materials/types
 * Creates a new material type (catalog item).
 * Validates against organization's catalog item limit.
 */
materialRouter.post(
  "/types",
  requirePermission("materials:create"),
  validateBody(MaterialModelZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);

      // Check catalog item limit
      await organizationService.incrementCatalogItemCount(organizationId);

      try {
        const materialType = await MaterialModel.create(req.body);

        res.status(201).json({
          status: "success",
          data: { materialType },
        });
      } catch (err) {
        // Rollback catalog count on failure
        await organizationService.decrementCatalogItemCount(organizationId);
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/materials/types/:id
 * Updates a material type.
 */
materialRouter.patch(
  "/types/:id",
  requirePermission("materials:update"),
  validateBody(MaterialModelZodSchema.partial()),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const materialType = await MaterialModel.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true, runValidators: true },
      );

      if (!materialType) {
        throw AppError.notFound("Material type not found");
      }

      res.json({
        status: "success",
        data: { materialType },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/materials/types/:id
 * Deletes a material type.
 */
materialRouter.delete(
  "/types/:id",
  requirePermission("materials:delete"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const materialTypeId = req.params.id as string;

      // Check if any instances exist
      const instanceCount = await MaterialInstance.countDocuments({
        modelId: materialTypeId,
      });

      if (instanceCount > 0) {
        throw AppError.badRequest(
          "Cannot delete material type with existing instances",
          { instanceCount },
        );
      }

      const materialType = await MaterialModel.findByIdAndDelete(req.params.id);

      if (!materialType) {
        throw AppError.notFound("Material type not found");
      }

      // Decrement catalog count
      await organizationService.decrementCatalogItemCount(getOrgId(req));

      res.json({
        status: "success",
        message: "Material type deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Material Instance Routes ---------- */

/**
 * GET /api/v1/materials/instances
 * Lists all material instances.
 */
materialRouter.get(
  "/instances",
  requirePermission("materials:read"),
  validateQuery(listMaterialsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        materialTypeId,
        search,
      } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const query: Record<string, unknown> = {};

      if (status) {
        query.status = status;
      }

      if (materialTypeId) {
        query.modelId = materialTypeId;
      }

      if (search) {
        query.serialNumber = { $regex: search, $options: "i" };
      }

      const [instances, total] = await Promise.all([
        MaterialInstance.find(query)
          .skip(skip)
          .limit(Number(limit))
          .populate("modelId", "name pricePerDay")
          .sort({ createdAt: -1 }),
        MaterialInstance.countDocuments(query),
      ]);

      res.json({
        status: "success",
        data: {
          instances,
          total,
          page: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/materials/instances/:id
 * Gets a specific material instance.
 */
materialRouter.get(
  "/instances/:id",
  requirePermission("materials:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instance = await MaterialInstance.findById(req.params.id).populate(
        "modelId",
        "name description pricePerDay categoryId",
      );

      if (!instance) {
        throw AppError.notFound("Material instance not found");
      }

      res.json({
        status: "success",
        data: { instance },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/materials/instances
 * Creates a new material instance.
 */
materialRouter.post(
  "/instances",
  requirePermission("materials:create"),
  validateBody(MaterialInstanceZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verify material type exists
      const materialType = await MaterialModel.findById(req.body.modelId);
      if (!materialType) {
        throw AppError.notFound("Material type not found");
      }

      const instance = await MaterialInstance.create(req.body);

      res.status(201).json({
        status: "success",
        data: { instance },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/materials/instances/:id/status
 * Updates a material instance's status (warehouse operator action).
 */
materialRouter.patch(
  "/instances/:id/status",
  requirePermission("materials:state:update"),
  validateBody(updateStatusSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, notes } = req.body;

      const instance = await MaterialInstance.findById(req.params.id);
      if (!instance) {
        throw AppError.notFound("Material instance not found");
      }

      // Validate status transition
      const validTransitions: Record<string, string[]> = {
        available: ["reserved", "maintenance", "damaged", "retired"],
        reserved: ["available", "loaned"],
        loaned: ["returned"],
        returned: ["available", "maintenance", "damaged"],
        maintenance: ["available", "retired"],
        damaged: ["maintenance", "retired"],
        lost: ["retired"],
        retired: [],
      };

      const currentStatus = instance.status;
      const allowedTransitions = validTransitions[currentStatus] ?? [];

      if (!allowedTransitions.includes(status)) {
        throw AppError.badRequest(
          `Invalid status transition from '${currentStatus}' to '${status}'`,
          { currentStatus, requestedStatus: status, allowedTransitions },
        );
      }

      instance.status = status;
      await instance.save();

      res.json({
        status: "success",
        data: { instance },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/materials/instances/:id
 * Deletes a material instance.
 */
materialRouter.delete(
  "/instances/:id",
  requirePermission("materials:delete"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instance = await MaterialInstance.findById(req.params.id);

      if (!instance) {
        throw AppError.notFound("Material instance not found");
      }

      // Only allow deletion if retired or never used
      if (!["available", "retired"].includes(instance.status)) {
        throw AppError.badRequest(
          "Can only delete available or retired material instances",
        );
      }

      await MaterialInstance.deleteOne({ _id: req.params.id });

      res.json({
        status: "success",
        message: "Material instance deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default materialRouter;

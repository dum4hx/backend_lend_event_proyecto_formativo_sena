import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { MaterialModelZodSchema } from "./models/material_type.model.ts";
import { MaterialInstanceZodSchema } from "./models/material_instance.model.ts";
import { CategoryZodSchema } from "./models/category.model.ts";
import { organizationService } from "../organization/organization.service.ts";
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
import { materialService } from "./material.service.ts";
import { AppError } from "../../errors/AppError.ts";

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
      const organizationId = getOrgId(req);
      const categories = await materialService.listCategories(organizationId);

      res.json({ status: "success", data: { categories } });
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
      const organizationId = getOrgId(req);
      const category = await materialService.createCategory(
        organizationId,
        req.body,
      );

      res.status(201).json({ status: "success", data: { category } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/materials/categories/:id
 * Updates a material category.
 */
materialRouter.patch(
  "/categories/:id",
  requirePermission("materials:update"),
  validateBody(CategoryZodSchema.partial()),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const updated = await materialService.updateCategory(
        getOrgId(req),
        req.params.id,
        req.body,
      );

      res.json({ status: "success", data: { category: updated } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/materials/categories/:id
 * Deletes a material category. Uses materialService to ensure no linked types.
 */
materialRouter.delete(
  "/categories/:id",
  requirePermission("materials:delete"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);

      await materialService.deleteCategory(organizationId, req.params.id);

      res.json({
        status: "success",
        message: "Category deleted successfully",
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

      const result = await materialService.listMaterialTypes(
        {
          page: page as string | number,
          limit: limit as string | number,
          categoryId: categoryId as string | undefined,
          search: search as string | undefined,
        },
        getOrgId(req),
      );

      res.json({ status: "success", data: result });
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
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const materialType = await materialService.getMaterialType(
        req.params.id,
        getOrgId(req),
      );

      res.json({ status: "success", data: { materialType } });
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

      const materialType = await materialService.createMaterialType(
        organizationId,
        req.body,
      );

      res.status(201).json({ status: "success", data: { materialType } });
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
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const updated = await materialService.updateMaterialType(
        getOrgId(req),
        req.params.id,
        req.body,
      );

      res.json({ status: "success", data: { materialType: updated } });
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
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      await materialService.deleteMaterialType(getOrgId(req), req.params.id);

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

      const result = await materialService.listInstances({
        page: page as string | number,
        limit: limit as string | number,
        status: status as string | undefined,
        materialTypeId: materialTypeId as string | undefined,
        search: search as string | undefined,
        organizationId: getOrgId(req),
      });

      res.json({ status: "success", data: result });
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
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const instance = await materialService.getInstance(
        req.params.id,
        getOrgId(req),
      );

      res.json({ status: "success", data: { instance } });
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
      const organizationId = getOrgId(req);
      const instance = await materialService.createInstance(
        organizationId,
        req.body,
      );

      res.status(201).json({ status: "success", data: { instance } });
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
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { status, notes } = req.body;
      const updated = await materialService.updateInstanceStatus(
        getOrgId(req),
        req.params.id,
        status,
        notes,
      );

      res.json({ status: "success", data: { instance: updated } });
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
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      await materialService.deleteInstance(getOrgId(req), req.params.id);

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

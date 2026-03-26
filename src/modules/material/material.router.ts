import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { MaterialModelZodSchema } from "./models/material_type.model.ts";
import {
  MaterialInstanceCreateZodSchema,
  MaterialInstanceUpdateZodSchema,
} from "./models/material_instance.model.ts";
import { CategoryZodSchema } from "./models/category.model.ts";
import { MaterialAttributeZodSchema } from "./models/material_attribute.model.ts";
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
  byLocation: z
    .string()
    .optional()
    .transform((val) => val === "true"),
  byUserAccessibleLocation: z
    .string()
    .optional()
    .transform((val) => val === "true"),
});

const updateStatusSchema = z.object({
  status: z.enum(materialStatusOptions),
  notes: z.string().max(500).optional(),
  source: z.enum(["manual", "scanner", "system"]).optional().default("manual"),
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

/* ---------- Material Attribute Routes ---------- */

const listAttributesQuerySchema = z.object({
  categoryId: z.string().optional(),
});

// Omit organizationId from client-facing validation; it is injected server-side
const createAttributeSchema = MaterialAttributeZodSchema.omit({
  organizationId: true,
});
const updateAttributeSchema = createAttributeSchema.partial();

/**
 * GET /api/v1/materials/attributes
 * Lists all material attributes for the organization. Optionally filtered by categoryId.
 */
materialRouter.get(
  "/attributes",
  requirePermission("material_attributes:read"),
  validateQuery(listAttributesQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const { categoryId } = req.query as { categoryId?: string };
      const opts = categoryId ? { categoryId } : {};
      const attributes = await materialService.listAttributes(
        organizationId,
        opts,
      );
      res.json({ status: "success", data: { attributes } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/materials/attributes/:id
 * Gets a specific material attribute.
 */
materialRouter.get(
  "/attributes/:id",
  requirePermission("material_attributes:read"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const attribute = await materialService.getAttribute(
        req.params.id,
        getOrgId(req),
      );
      res.json({ status: "success", data: { attribute } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/materials/attributes
 * Creates a new material attribute for the organization.
 */
materialRouter.post(
  "/attributes",
  requirePermission("material_attributes:create"),
  validateBody(createAttributeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const attribute = await materialService.createAttribute(
        organizationId,
        req.body,
      );
      res.status(201).json({ status: "success", data: { attribute } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/materials/attributes/:id
 * Updates a material attribute. All fields are optional.
 */
materialRouter.patch(
  "/attributes/:id",
  requirePermission("material_attributes:update"),
  validateBody(updateAttributeSchema),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const updated = await materialService.updateAttribute(
        getOrgId(req),
        req.params.id,
        req.body,
      );
      res.json({ status: "success", data: { attribute: updated } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/materials/attributes/:id
 * Deletes a material attribute. Fails if any material type currently uses it.
 */
materialRouter.delete(
  "/attributes/:id",
  requirePermission("material_attributes:delete"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      await materialService.deleteAttribute(getOrgId(req), req.params.id);
      res.json({
        status: "success",
        message: "Material attribute deleted successfully",
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
  validateBody(MaterialModelZodSchema.omit({ organizationId: true })),
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
 *
 * When byUserAccessibleLocation=true, returns instances split into:
 *   - currentUserLocations: instances at locations assigned to the requesting user
 *   - otherLocations: instances at all other locations
 * Requires: materials:read
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
        byLocation,
        byUserAccessibleLocation,
      } = req.query as any;

      if (byUserAccessibleLocation) {
        const result = await materialService.listInstancesByUserLocation({
          status: status as string | undefined,
          materialTypeId: materialTypeId as string | undefined,
          search: search as string | undefined,
          organizationId: getOrgId(req),
          userId: req.user!.userId,
        });

        return res.json({ status: "success", data: result });
      }

      const result = await materialService.listInstances({
        page: page as string | number,
        limit: limit as string | number,
        status: status as string | undefined,
        materialTypeId: materialTypeId as string | undefined,
        search: search as string | undefined,
        organizationId: getOrgId(req),
        byLocation: byLocation as boolean | undefined,
      });

      res.json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/materials/instances/scan/:code
 * Scans a material instance by barcode (exact match) with fallback to serialNumber.
 * Requires: materials:read
 */
materialRouter.get(
  "/instances/scan/:code",
  requirePermission("materials:read"),
  async (req: Request<{ code: string }>, res: Response, next: NextFunction) => {
    try {
      const { instance, matchedBy } = await materialService.scanInstance(
        getOrgId(req),
        req.params.code,
      );

      res.json({ status: "success", data: { instance, matchedBy } });
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
 *
 * Supports capacity validation:
 * - If location is at full capacity for the material type, returns 409 Conflict.
 * - Client can override by sending 'force: true' in the request body.
 */
materialRouter.post(
  "/instances",
  requirePermission("materials:create"),
  validateBody(MaterialInstanceCreateZodSchema),
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
 * PATCH /api/v1/materials/instances/:id
 * Updates editable data of a material instance.
 *
 * Supports serial/barcode rules:
 * - useBarcodeAsSerial=true  => serialNumber is persisted as barcode
 * - useBarcodeAsSerial=false => serialNumber must be provided manually
 * - omitted switch keeps backward-compatible behavior
 */
materialRouter.patch(
  "/instances/:id",
  requirePermission("materials:update"),
  validateBody(MaterialInstanceUpdateZodSchema),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const instance = await materialService.updateInstance(
        getOrgId(req),
        req.params.id,
        req.body,
      );

      res.json({ status: "success", data: { instance } });
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
      const { status, notes, source } = req.body;
      const updated = await materialService.updateInstanceStatus(
        getOrgId(req),
        req.params.id,
        status,
        notes,
        req.user!.userId,
        source,
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

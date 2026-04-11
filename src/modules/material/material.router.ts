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
        message: "Categoría eliminada exitosamente",
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
        message: "Atributo de material eliminado exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/materials/audit/orphaned-attribute-values
 * Audit endpoint: Find all material types with orphaned allowedValues
 * (i.e., attributes with values no longer in the attribute's allowedValues array).
 * Returns list of affected materials and the orphaned values.
 */
materialRouter.get(
  "/audit/orphaned-attribute-values",
  requirePermission("materials:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orphaned = await materialService.auditOrphanedAttributeValues(
        getOrgId(req),
      );
      res.json({
        status: "success",
        data: {
          orphanedCount: orphaned.length,
          orphanedMaterials: orphaned,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/materials/audit/attribute-deletion-impact/:attributeId
 * Audit endpoint: Check cascade impact when deleting an attribute.
 * Shows how many material types use this attribute and whether it's required.
 */
materialRouter.get(
  "/audit/attribute-deletion-impact/:attributeId",
  requirePermission("materials:read"),
  async (
    req: Request<{ attributeId: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const impact = await materialService.getAttributeDeletionImpact(
        getOrgId(req),
        req.params.attributeId,
      );
      res.json({
        status: "success",
        data: impact,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Catalog Overview Schema ---------- */

const catalogOverviewQuerySchema = paginationSchema.extend({
  locationId: z.string().optional(),
  categoryId: z.string().optional(),
  materialTypeId: z.string().optional(),
  search: z.string().optional(),
});

/* ---------- Catalog Overview Route ---------- */

/**
 * GET /api/v1/materials/catalog/overview
 *
 * Returns a comprehensive, aggregation-driven operational view of the catalog
 * and item status — computed entirely in MongoDB (no instances loaded into memory).
 *
 * Scope:
 * - Organization-wide (default): aggregates across ALL locations.
 * - Location-specific: add ?locationId=<id> to filter to one location.
 *
 * Permissions: materials:read
 *
 * Query params:
 * - locationId    : limit scope to a single location
 * - categoryId    : filter by category
 * - materialTypeId: filter to a single material type
 * - search        : text search on material type name
 * - page / limit  : paginate the materialTypes list
 *
 * Response 200:
 * {
 *   status: "success",
 *   data: {
 *     summary: { totalMaterialTypes, totalInstances, globalAvailabilityRate,
 *                globalUtilizationRate, materialTypesWithLowStock, materialTypesWithHighDamage },
 *     materialTypes: [
 *       { materialTypeId, name, pricePerDay, categories,
 *         totals: { totalInstances, available, reserved, loaned, inUse,
 *                   returned, maintenance, damaged, lost, retired },
 *         metrics: { availabilityRate, utilizationRate, damageRate,
 *                    repairRate, reservationPressure },
 *         alerts: [{ type, severity }] }
 *     ],
 *     pagination: { page, limit, total, totalPages }
 *   }
 * }
 *
 * Alert types:
 * - LOW_STOCK          : available < 20% of total AND < 5 units
 * - HIGH_UTILIZATION   : (loaned + inUse) / total > 0.8
 * - HIGH_DAMAGE_RATE   : damaged / total > 0.1 (high) or > 0.05 (medium)
 * - OVER_RESERVED      : reserved > available
 */
materialRouter.get(
  "/catalog/overview",
  requirePermission("materials:read"),
  validateQuery(catalogOverviewQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const { locationId, categoryId, materialTypeId, search, page, limit } =
        req.query as {
          locationId?: string;
          categoryId?: string;
          materialTypeId?: string;
          search?: string;
          page?: string;
          limit?: string;
        };

      const result = await materialService.getCatalogOverview({
        organizationId,
        ...(locationId && { locationId }),
        ...(categoryId && { categoryId }),
        ...(materialTypeId && { materialTypeId }),
        ...(search && { search }),
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50,
      });

      res.status(200).json({ status: "success", data: result });
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
 *
 * Attributes:
 * - Each attribute can be marked as required (isRequired: true) or optional (isRequired: false, default).
 * - Required attributes must have non-empty values.
 * - Attribute values are validated against allowedValues if defined on the MaterialAttribute.
 * - Attribute scope is validated (category-scoped attributes must match material type's categories).
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
 *
 * Attributes:
 * - Each attribute can be marked as required (isRequired: true) or optional (isRequired: false).
 * - Required attributes must have non-empty values.
 * - You can add, remove, or change the required status of individual attributes.
 * - Required attributes cannot be removed once marked as required (validation will reject).
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
        message: "Tipo de material eliminado exitosamente",
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

      const userLocationIds = await materialService.getUserLocationIds(
        req.user!.userId,
      );

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
        locationIds: userLocationIds,
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
      const userLocationIds = await materialService.getUserLocationIds(
        req.user!.userId,
      );
      const { instance, matchedBy } = await materialService.scanInstance(
        getOrgId(req),
        req.params.code,
        userLocationIds,
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
      const userLocationIds = await materialService.getUserLocationIds(
        req.user!.userId,
      );
      const instance = await materialService.getInstance(
        req.params.id,
        getOrgId(req),
        userLocationIds,
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
      const userLocationIds = await materialService.getUserLocationIds(
        req.user!.userId,
      );
      const instance = await materialService.createInstance(
        organizationId,
        req.body,
        userLocationIds,
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
      const userLocationIds = await materialService.getUserLocationIds(
        req.user!.userId,
      );
      const instance = await materialService.updateInstance(
        getOrgId(req),
        req.params.id,
        req.body,
        userLocationIds,
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
      const userLocationIds = await materialService.getUserLocationIds(
        req.user!.userId,
      );
      const updated = await materialService.updateInstanceStatus(
        getOrgId(req),
        req.params.id,
        status,
        notes,
        req.user!.userId,
        source,
        userLocationIds,
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
      const userLocationIds = await materialService.getUserLocationIds(
        req.user!.userId,
      );
      await materialService.deleteInstance(
        getOrgId(req),
        req.params.id,
        userLocationIds,
      );

      res.json({
        status: "success",
        message: "Instancia de material eliminada exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default materialRouter;

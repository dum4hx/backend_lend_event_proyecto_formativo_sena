import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  MaintenanceBatchCreateZodSchema,
  MaintenanceBatchUpdateZodSchema,
  MaintenanceBatchItemAddZodSchema,
  MaintenanceBatchResolveItemZodSchema,
  batchStatusOptions,
} from "./models/maintenance_batch.model.ts";
import { maintenanceService } from "./maintenance.service.ts";
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
  getAuthUser,
} from "../../middleware/auth.ts";

const maintenanceRouter = Router();

// All routes require authentication and active organization
maintenanceRouter.use(authenticate, requireActiveOrganization);

/* ---------- Validation Schemas ---------- */

const listBatchesQuerySchema = paginationSchema.extend({
  status: z.enum(batchStatusOptions).optional(),
  assignedTo: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val))
    .optional(),
});

const batchIdParamSchema = z.object({
  id: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de lote no válido",
  }),
});

const instanceIdParamSchema = z.object({
  id: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de lote no válido",
  }),
  instanceId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de instancia de material no válido",
  }),
});

/* ---------- Routes ---------- */

/**
 * GET /api/v1/maintenance
 * Lists maintenance batches for the organization.
 * Permission: maintenance:read
 */
maintenanceRouter.get(
  "/",
  requirePermission("maintenance:read"),
  validateQuery(listBatchesQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const {
        page = 1,
        limit = 20,
        status,
        assignedTo,
      } = req.query as unknown as z.infer<typeof listBatchesQuerySchema>;

      const data = await maintenanceService.listBatches({
        organizationId,
        page,
        limit,
        ...(status ? { status } : {}),
        ...(assignedTo ? { assignedTo } : {}),
      });

      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/maintenance
 * Creates a new maintenance batch in draft status.
 * Permission: maintenance:create
 */
maintenanceRouter.post(
  "/",
  requirePermission("maintenance:create"),
  validateBody(MaintenanceBatchCreateZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);

      const data = await maintenanceService.createBatch({
        organizationId,
        createdBy: user.id,
        data: req.body,
      });

      res.status(201).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/maintenance/:id
 * Gets a single maintenance batch by ID.
 * Permission: maintenance:read
 */
maintenanceRouter.get(
  "/:id",
  requirePermission("maintenance:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const data = await maintenanceService.getBatchById(
        req.params.id as string,
        organizationId,
      );

      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/maintenance/:id
 * Updates batch metadata. Only allowed while batch is in draft.
 * Permission: maintenance:update
 */
maintenanceRouter.patch(
  "/:id",
  requirePermission("maintenance:update"),
  validateBody(MaintenanceBatchUpdateZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const data = await maintenanceService.updateBatch(
        req.params.id as string,
        organizationId,
        req.body,
      );

      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/maintenance/:id/start
 * Starts a maintenance batch (draft → in_progress).
 * Permission: maintenance:update
 */
maintenanceRouter.post(
  "/:id/start",
  requirePermission("maintenance:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);

      const data = await maintenanceService.startBatch(
        req.params.id as string,
        organizationId,
        user.id,
      );

      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/maintenance/:id/cancel
 * Cancels a maintenance batch.
 * Permission: maintenance:update
 */
maintenanceRouter.post(
  "/:id/cancel",
  requirePermission("maintenance:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);

      const data = await maintenanceService.cancelBatch(
        req.params.id as string,
        organizationId,
        user.id,
      );

      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/maintenance/:id/items
 * Adds items to a draft maintenance batch.
 * Permission: maintenance:update
 */
maintenanceRouter.post(
  "/:id/items",
  requirePermission("maintenance:update"),
  validateBody(MaintenanceBatchItemAddZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);

      const data = await maintenanceService.addItems(
        req.params.id as string,
        organizationId,
        user.id,
        req.body.items,
      );

      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/maintenance/:id/items/:instanceId
 * Removes an item from a draft batch.
 * Permission: maintenance:update
 */
maintenanceRouter.delete(
  "/:id/items/:instanceId",
  requirePermission("maintenance:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);

      const data = await maintenanceService.removeItem(
        req.params.id as string,
        organizationId,
        req.params.instanceId as string,
      );

      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/maintenance/:id/items/:instanceId
 * Resolves a single item as repaired or unrecoverable.
 * Permission: maintenance:resolve
 */
maintenanceRouter.patch(
  "/:id/items/:instanceId",
  requirePermission("maintenance:resolve"),
  validateBody(MaintenanceBatchResolveItemZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);

      const data = await maintenanceService.resolveItem(
        req.params.id as string,
        organizationId,
        user.id,
        req.params.instanceId as string,
        req.body,
      );

      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

export default maintenanceRouter;

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { InspectionZodSchema } from "./models/inspection.model.ts";
import { inspectionService } from "./inspection.service.ts";
import { AppError } from "../../errors/AppError.ts";
import {
  validateBody,
  validateQuery,
  validateParams,
  paginationSchema,
} from "../../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
  getAuthUser,
} from "../../middleware/auth.ts";

const inspectionRouter = Router();

// All routes require authentication and active organization
inspectionRouter.use(authenticate, requireActiveOrganization);

/* ---------- Validation Schemas ---------- */

const listInspectionsQuerySchema = paginationSchema.extend({
  loanId: z.string().optional(),
});

const inspectionItemSchema = z.object({
  materialInstanceId: z.string(),
  condition: z.enum(["good", "damaged", "lost"]),
  notes: z.string().max(500).optional(),
  damageDescription: z.string().max(1000).optional(),
  damageCost: z.number().min(0).optional(),
});

const createInspectionSchema = z.object({
  loanId: z.string(),
  items: z.array(inspectionItemSchema),
  overallNotes: z.string().max(2000).optional(),
  dueDate: z.preprocess((val) => {
    if (!val) return undefined;
    return typeof val === "string" ? new Date(val) : val;
  }, z.date().optional()),
});

const inspectionIdParamSchema = z.object({
  id: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Inspection ID format",
  }),
});

/* ---------- Routes ---------- */

/**
 * GET /api/v1/inspections
 * Lists all inspections in the organization.
 */
inspectionRouter.get(
  "/",
  requirePermission("inspections:read"),
  validateQuery(listInspectionsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const {
        page = 1,
        limit = 20,
        loanId,
      } = req.query as unknown as z.infer<typeof listInspectionsQuerySchema>;

      const data = await (inspectionService.listInspections as any)({
        organizationId,
        page,
        limit,
        loanId: (loanId as string) || undefined,
      });

      res.json({
        status: "success",
        data,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/inspections/pending-loans
 * Gets loans that are returned but not yet inspected.
 */
inspectionRouter.get(
  "/pending-loans",
  requirePermission("inspections:create"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const pendingLoans =
        await inspectionService.getPendingLoans(organizationId);

      res.json({
        status: "success",
        data: { pendingLoans },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/inspections/:id
 * Gets a specific inspection by ID.
 */
inspectionRouter.get(
  "/:id",
  requirePermission("inspections:read"),
  validateParams(inspectionIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const inspectionId = req.params.id as string;
      const inspection = await inspectionService.getInspectionById(
        inspectionId,
        organizationId,
      );

      res.json({
        status: "success",
        data: { inspection },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/inspections
 * Creates an inspection for a returned loan (Warehouse Operator action).
 */
inspectionRouter.post(
  "/",
  requirePermission("inspections:create"),
  validateBody(createInspectionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);
      const { loanId, items, overallNotes, dueDate } = req.body;

      const result = await inspectionService.createInspection({
        organizationId,
        userId: user.id,
        loanId,
        items,
        overallNotes,
        dueDate,
      });

      if (!result) {
        throw AppError.internal("Failed to create inspection");
      }

      res.status(201).json({
        status: "success",
        data: { inspection: result.inspection },
        message:
          result.totalDamageCost > 0
            ? `Inspection created. Damage invoice generated for $${result.totalDamageCost.toFixed(2)}`
            : "Inspection created. No damages found.",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default inspectionRouter;

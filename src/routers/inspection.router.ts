import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  Inspection,
  InspectionZodSchema,
} from "../modules/inspection/models/inspection.model.ts";
import { Loan } from "../modules/loan/models/loan.model.ts";
import { Invoice } from "../modules/invoice/models/invoice.model.ts";
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
  getAuthUser,
} from "../middleware/auth.ts";
import { AppError } from "../errors/AppError.ts";

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
      const skip = (page - 1) * limit;

      const query: Record<string, unknown> = { organizationId };

      if (loanId) {
        query.loanId = loanId;
      }

      const [inspections, total] = await Promise.all([
        Inspection.find(query)
          .skip(skip)
          .limit(limit)
          .populate("loanId", "customerId startDate endDate")
          .populate("inspectedById", "email profile.firstName")
          .sort({ createdAt: -1 }),
        Inspection.countDocuments(query),
      ]);

      res.json({
        status: "success",
        data: {
          inspections,
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
 * GET /api/v1/inspections/:id
 * Gets a specific inspection by ID.
 */
inspectionRouter.get(
  "/:id",
  requirePermission("inspections:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inspection = await Inspection.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
      })
        .populate("loanId")
        .populate("inspectedById", "email profile")
        .populate("items.materialInstanceId", "serialNumber modelId");

      if (!inspection) {
        throw AppError.notFound("Inspection not found");
      }

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

      // Validate loan exists and is in returned status
      const loan = await Loan.findOne({
        _id: req.body.loanId,
        organizationId,
        status: "returned",
      });

      if (!loan) {
        throw AppError.notFound("Loan not found or not in returned status");
      }

      // Check if inspection already exists
      const existingInspection = await Inspection.findOne({ loanId: loan._id });
      if (existingInspection) {
        throw AppError.conflict("Inspection already exists for this loan");
      }

      // Validate all items match loan materials
      const loanMaterialIds = loan.materialInstances.map((id) => id.toString());
      const inspectionMaterialIds = req.body.items.map(
        (item: { materialInstanceId: string }) => item.materialInstanceId,
      );

      const missingMaterials = loanMaterialIds.filter(
        (id) => !inspectionMaterialIds.includes(id),
      );

      if (missingMaterials.length > 0) {
        throw AppError.badRequest("All loan materials must be inspected", {
          missingMaterialIds: missingMaterials,
        });
      }

      // Calculate total damage cost
      const totalDamageCost = req.body.items.reduce(
        (sum: number, item: { damageCost?: number }) =>
          sum + (item.damageCost ?? 0),
        0,
      );

      // Create inspection with proper items format
      const inspectionItems = req.body.items.map(
        (item: {
          materialInstanceId: string;
          condition: string;
          notes?: string;
          damageDescription?: string;
          damageCost?: number;
        }) => ({
          materialInstanceId: new Types.ObjectId(item.materialInstanceId),
          conditionBefore: "good", // Default, would be populated from loan data in real impl
          conditionAfter: item.condition,
          damageDescription: item.damageDescription,
          chargeToCustomer: item.damageCost ?? 0,
          repairRequired: item.condition === "damaged",
        }),
      );

      const inspection = await Inspection.create({
        organizationId,
        loanId: loan._id,
        inspectedBy: new Types.ObjectId(user.id),
        items: inspectionItems,
        notes: req.body.overallNotes,
        status: "completed",
      });

      // If there are damages, create an invoice
      const damagedItems = req.body.items.filter(
        (item: { condition: string }) =>
          item.condition === "damaged" || item.condition === "lost",
      );

      if (damagedItems.length > 0 && totalDamageCost > 0) {
        const invoiceLineItems = damagedItems.map(
          (item: {
            materialInstanceId: string;
            damageDescription?: string;
            damageCost?: number;
            condition: string;
          }) => ({
            description:
              item.damageDescription ??
              `${item.condition === "lost" ? "Lost" : "Damaged"} material`,
            quantity: 1,
            unitPrice: item.damageCost ?? 0,
            totalPrice: item.damageCost ?? 0,
            referenceId: new Types.ObjectId(item.materialInstanceId),
            referenceType: "MaterialInstance" as const,
          }),
        );

        await Invoice.create({
          organizationId,
          customerId: loan.customerId,
          loanId: loan._id,
          inspectionId: inspection._id,
          type: "damage",
          lineItems: invoiceLineItems,
          subtotal: totalDamageCost,
          taxRate: 0.19, // 19% tax (Colombian IVA)
          taxAmount: totalDamageCost * 0.19,
          totalAmount: totalDamageCost * 1.19,
          status: "pending",
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          createdBy: new Types.ObjectId(user.id),
          invoiceNumber: `INV-${Date.now()}`,
        });
      }

      const populatedInspection = await Inspection.findById(inspection._id)
        .populate("loanId", "customerId startDate endDate")
        .populate("items.materialInstanceId", "serialNumber modelId");

      res.status(201).json({
        status: "success",
        data: { inspection: populatedInspection },
        message:
          totalDamageCost > 0
            ? `Inspection created. Damage invoice generated for $${totalDamageCost.toFixed(2)}`
            : "Inspection created. No damages found.",
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

      // Find returned loans without inspections
      const returnedLoans = await Loan.find({
        organizationId,
        status: "returned",
      });

      const existingInspections = await Inspection.find({
        loanId: { $in: returnedLoans.map((l) => l._id) },
      }).select("loanId");

      const inspectedLoanIds = new Set(
        existingInspections.map((i) => i.loanId.toString()),
      );

      const pendingLoans = await Loan.find({
        _id: {
          $in: returnedLoans
            .filter((l) => !inspectedLoanIds.has(l._id.toString()))
            .map((l) => l._id),
        },
      })
        .populate("customerId", "email name")
        .populate("materialInstances", "serialNumber modelId");

      res.json({
        status: "success",
        data: { pendingLoans },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default inspectionRouter;

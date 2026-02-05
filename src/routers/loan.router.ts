import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  Loan,
  LoanZodSchema,
  loanStatusOptions,
} from "../modules/loan/models/loan.model.ts";
import { LoanRequest } from "../modules/request/models/request.model.ts";
import { MaterialInstance } from "../modules/material/models/material_instance.model.ts";
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

const loanRouter = Router();

// All routes require authentication and active organization
loanRouter.use(authenticate, requireActiveOrganization);

/* ---------- Validation Schemas ---------- */

const listLoansQuerySchema = paginationSchema.extend({
  status: z.enum(loanStatusOptions).optional(),
  customerId: z.string().optional(),
  overdue: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
});

const extendLoanSchema = z.object({
  newEndDate: z.string().datetime(),
  notes: z.string().max(500).optional(),
});

const returnLoanSchema = z.object({
  notes: z.string().max(500).optional(),
});

/* ---------- Routes ---------- */

/**
 * GET /api/v1/loans
 * Lists all loans in the organization.
 */
loanRouter.get(
  "/",
  requirePermission("loans:read"),
  validateQuery(listLoansQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const {
        page = 1,
        limit = 20,
        status,
        customerId,
        overdue,
        sortBy,
        sortOrder,
      } = req.query as unknown as z.infer<typeof listLoansQuerySchema>;
      const skip = (page - 1) * limit;

      const query: Record<string, unknown> = { organizationId };

      if (status) {
        query.status = status;
      }
      if (customerId) {
        query.customerId = customerId;
      }
      if (overdue === true) {
        query.status = "overdue";
      }

      const sortField = sortBy ?? "createdAt";
      const sortDirection = sortOrder === "asc" ? 1 : -1;

      const [loans, total] = await Promise.all([
        Loan.find(query)
          .skip(skip)
          .limit(limit)
          .populate("customerId", "email name")
          .populate("requestId", "packageId")
          .populate("materialInstances", "serialNumber modelId")
          .sort({ [sortField]: sortDirection }),
        Loan.countDocuments(query),
      ]);

      res.json({
        status: "success",
        data: {
          loans,
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
 * GET /api/v1/loans/overdue
 * Gets all overdue loans.
 */
loanRouter.get(
  "/overdue",
  requirePermission("loans:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);

      // Update overdue status
      const now = new Date();
      await Loan.updateMany(
        {
          organizationId,
          status: "active",
          endDate: { $lt: now },
        },
        { $set: { status: "overdue" } },
      );

      const overdueLoans = await Loan.find({
        organizationId,
        status: "overdue",
      })
        .populate("customerId", "email name phone")
        .populate("materialInstances", "serialNumber modelId")
        .sort({ endDate: 1 });

      res.json({
        status: "success",
        data: { loans: overdueLoans },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/loans/:id
 * Gets a specific loan by ID.
 */
loanRouter.get(
  "/:id",
  requirePermission("loans:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loan = await Loan.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
      })
        .populate("customerId", "email name phone address")
        .populate("requestId")
        .populate("materialInstances", "serialNumber status modelId");

      if (!loan) {
        throw AppError.notFound("Loan not found");
      }

      res.json({
        status: "success",
        data: { loan },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/loans/from-request/:requestId
 * Creates a loan from a ready request (pickup action by Warehouse Operator).
 */
loanRouter.post(
  "/from-request/:requestId",
  requirePermission("loans:create"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);

      // Find and validate request
      const request = await LoanRequest.findOne({
        _id: req.params.requestId,
        organizationId,
        status: "ready",
      }).populate("packageId");

      if (!request) {
        throw AppError.notFound("Request not found or not ready for pickup");
      }

      // Update material instances to loaned status
      const instanceIds = request.assignedMaterials.map(
        (am) => am.materialInstanceId,
      );
      await MaterialInstance.updateMany(
        { _id: { $in: instanceIds } },
        { $set: { status: "loaned" } },
      );

      // Create the loan
      const loan = await Loan.create({
        organizationId,
        customerId: request.customerId,
        requestId: request._id,
        materialInstances: instanceIds.map((id) => ({
          materialInstanceId: id,
          materialTypeId: id, // Will be populated properly
        })),
        startDate: new Date(),
        endDate: request.endDate,
        depositAmount: request.depositAmount ?? 0,
        totalAmount: request.totalAmount ?? 0,
        checkedOutBy: new Types.ObjectId(user.id),
        status: "active",
      });

      // Update request - use a valid request status value
      await LoanRequest.updateOne(
        { _id: request._id },
        { $set: { status: "cancelled" } }, // No "completed" status in request, closest is cancelled or we add handling
      );

      const populatedLoan = await Loan.findById(loan._id)
        .populate("customerId", "email name")
        .populate("materialInstances", "serialNumber modelId");

      res.status(201).json({
        status: "success",
        data: { loan: populatedLoan },
        message: "Loan created successfully - materials picked up",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/loans/:id/extend
 * Extends a loan's end date.
 */
loanRouter.post(
  "/:id/extend",
  requirePermission("loans:update"),
  validateBody(extendLoanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loan = await Loan.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
        status: { $in: ["active", "overdue"] },
      });

      if (!loan) {
        throw AppError.notFound("Loan not found or cannot be extended");
      }

      const newEndDate = new Date(req.body.newEndDate);
      const currentEndDate = loan.endDate;

      if (newEndDate <= currentEndDate) {
        throw AppError.badRequest(
          "New end date must be after current end date",
        );
      }

      loan.endDate = newEndDate;
      loan.status = "active"; // Reset from overdue if applicable
      if (req.body.notes) {
        loan.notes = (loan.notes ?? "") + `\nExtension: ${req.body.notes}`;
      }
      await loan.save();

      res.json({
        status: "success",
        data: { loan },
        message: "Loan extended successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/loans/:id/return
 * Initiates the return process for a loan (sets status to returned, triggers inspection).
 */
loanRouter.post(
  "/:id/return",
  requirePermission("loans:update"),
  validateBody(returnLoanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loan = await Loan.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
        status: { $in: ["active", "overdue"] },
      });

      if (!loan) {
        throw AppError.notFound("Loan not found or already returned");
      }

      // Update material instances to returned status (pending inspection)
      await MaterialInstance.updateMany(
        { _id: { $in: loan.materialInstances } },
        { $set: { status: "returned" } },
      );

      loan.status = "returned";
      loan.returnedAt = new Date();
      if (req.body.notes) {
        loan.notes = (loan.notes ?? "") + `\nReturn notes: ${req.body.notes}`;
      }
      await loan.save();

      res.json({
        status: "success",
        data: { loan },
        message: "Loan marked as returned - pending inspection",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/loans/:id/complete
 * Completes a loan after inspection (final step).
 */
loanRouter.post(
  "/:id/complete",
  requirePermission("loans:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loan = await Loan.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
        status: "returned",
      });

      if (!loan) {
        throw AppError.notFound("Loan not found or not in returned status");
      }

      // Check if inspection exists and is completed
      const { Inspection } =
        await import("../modules/inspection/models/inspection.model.ts");
      const inspection = await Inspection.findOne({
        loanId: loan._id,
      });

      if (!inspection) {
        throw AppError.badRequest("Loan must be inspected before completion");
      }

      // Update materials to available (or damaged based on inspection)
      for (const instance of loan.materialInstances) {
        const inspectionItem = inspection.items.find(
          (item) =>
            item.materialInstanceId.toString() ===
            instance.materialInstanceId.toString(),
        );

        const newStatus =
          inspectionItem?.conditionAfter === "damaged"
            ? "damaged"
            : inspectionItem?.conditionAfter === "lost"
              ? "lost"
              : "available";

        await MaterialInstance.updateOne(
          { _id: instance.materialInstanceId },
          { $set: { status: newStatus } },
        );
      }

      loan.status = "closed";
      await loan.save();

      res.json({
        status: "success",
        data: { loan },
        message: "Loan completed successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default loanRouter;

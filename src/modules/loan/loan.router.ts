import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { loanStatusOptions } from "../loan/models/loan.model.ts";
import { loanService } from "./loan.service.ts";
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
import { AppError } from "../../errors/AppError.ts";

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
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const extendLoanSchema = z.object({
  newEndDate: z.string().datetime(),
  notes: z.string().max(500).optional(),
});

const returnLoanSchema = z.object({
  notes: z.string().max(500).optional(),
});

const getLoanQuerySchema = z.object({
  groupByMaterialType: z
    .string()
    .optional()
    .transform((val) => val === "true"),
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
      const user = getAuthUser(req);
      const query = req.query as any;

      const result = await loanService.listLoans(
        organizationId,
        user.id,
        query,
      );

      res.json({
        status: "success",
        data: result,
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
      const user = getAuthUser(req);

      const result = await loanService.listLoans(organizationId, user.id, {
        overdue: true,
        sortBy: "endDate",
        sortOrder: "asc",
      });

      res.json({
        status: "success",
        data: { loans: result.loans },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/loans/:id
 * Gets a specific loan by ID.
 *
 * Query Parameters:
 * - groupByMaterialType: If true, materialInstances are grouped by materialTypeId.
 */
loanRouter.get(
  "/:id",
  requirePermission("loans:read"),
  validateQuery(getLoanQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);
      const loanId = req.params.id;
      const { groupByMaterialType } = req.query as any;

      if (!loanId || typeof loanId !== "string") {
        throw AppError.badRequest("ID de préstamo no válido");
      }

      const opts =
        groupByMaterialType !== undefined ? { groupByMaterialType } : undefined;
      const loan = await loanService.getLoanById(
        loanId,
        organizationId,
        user.id,
        opts,
      );

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
      const requestId = req.params.requestId;

      if (!requestId || typeof requestId !== "string") {
        throw AppError.badRequest("ID de solicitud no válido");
      }

      const loan = await loanService.createLoanFromRequest({
        requestId: requestId,
        organizationId,
        userId: user.id,
      });

      res.status(201).json({
        status: "success",
        data: { loan },
        message: "Préstamo creado exitosamente - materiales recogidos",
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
      const organizationId = getOrgId(req);
      const loanId = req.params.id;

      if (!loanId || typeof loanId !== "string") {
        throw AppError.badRequest("ID de préstamo no válido");
      }

      const newEndDate = new Date(req.body.newEndDate);

      const loan = await loanService.extendLoan(
        loanId,
        organizationId,
        newEndDate,
        req.body.notes,
      );

      res.json({
        status: "success",
        data: { loan },
        message: "Préstamo extendido exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/loans/:id/return
 * Initiates the return process for a loan (sets status to returned, triggers inspection).
 * Requires: loans:return
 */
loanRouter.post(
  "/:id/return",
  requirePermission("loans:return"),
  validateBody(returnLoanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const loanId = req.params.id;

      if (!loanId || typeof loanId !== "string") {
        throw AppError.badRequest("ID de préstamo no válido");
      }

      const loan = await loanService.returnLoan(
        loanId,
        organizationId,
        req.body.notes,
      );

      res.json({
        status: "success",
        data: { loan },
        message: "Préstamo marcado como devuelto - inspección pendiente",
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
      const organizationId = getOrgId(req);
      const loanId = req.params.id;

      if (!loanId || typeof loanId !== "string") {
        throw AppError.badRequest("ID de préstamo no válido");
      }

      const loan = await loanService.completeLoan(loanId, organizationId);

      res.json({
        status: "success",
        data: { loan },
        message: "Préstamo completado exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/loans/:id/deposit/refund
 * Refunds the deposit for a loan in refund_pending or partially_applied status.
 * Requires loans:update permission.
 */
loanRouter.post(
  "/:id/deposit/refund",
  requirePermission("loans:update"),
  validateBody(z.object({ notes: z.string().max(500).optional() })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const loanId = req.params.id;

      if (!loanId || typeof loanId !== "string") {
        throw AppError.badRequest("ID de préstamo no válido");
      }

      const loan = await loanService.refundDeposit({
        loanId,
        organizationId,
        notes: req.body.notes,
      });

      res.json({
        status: "success",
        data: { loan },
        message: "Depósito reembolsado exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default loanRouter;

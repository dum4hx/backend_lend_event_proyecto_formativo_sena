import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  invoiceStatusOptions,
  invoiceTypeOptions,
} from "../invoice/models/invoice.model.ts";
import { invoiceService } from "./invoice.service.ts";
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

const invoiceRouter = Router();

// All routes require authentication and active organization
invoiceRouter.use(authenticate, requireActiveOrganization);

/* ---------- Validation Schemas ---------- */

const listInvoicesQuerySchema = paginationSchema.extend({
  status: z.enum(invoiceStatusOptions).optional(),
  type: z.enum(invoiceTypeOptions).optional(),
  customerId: z.string().optional(),
  loanId: z.string().optional(),
  overdue: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
});

const createInvoiceSchema = z.object({
  customerId: z.string(),
  loanId: z.string().optional(),
  type: z.enum(invoiceTypeOptions),
  items: z.array(
    z.object({
      description: z.string().max(500),
      quantity: z.number().int().positive(),
      unitPrice: z.number().min(0),
      materialInstanceId: z.string().optional(),
    }),
  ),
  notes: z.string().max(1000).optional(),
  dueDate: z.string().datetime().optional(),
  taxRate: z.number().min(0).max(1).default(0.19), // Default 19% Colombian IVA
});

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethodId: z.string().refine((v) => Types.ObjectId.isValid(v), {
    message: "paymentMethodId debe ser un ObjectId válido",
  }),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

const voidInvoiceSchema = z.object({
  reason: z.string().min(1).max(500),
});

/* ---------- Routes ---------- */

/**
 * GET /api/v1/invoices
 * Lists all invoices in the organization.
 */
invoiceRouter.get(
  "/",
  requirePermission("invoices:read"),
  validateQuery(listInvoicesQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const params = req.query as unknown as z.infer<
        typeof listInvoicesQuerySchema
      >;

      const result = await invoiceService.listInvoices({
        organizationId,
        page: params.page,
        limit: params.limit,
        status: params.status,
        type: params.type,
        customerId: params.customerId,
        loanId: params.loanId,
        overdue: params.overdue,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });

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
 * GET /api/v1/invoices/summary
 * Gets invoice summary/statistics for the organization.
 */
invoiceRouter.get(
  "/summary",
  requirePermission("invoices:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const summary = await invoiceService.getInvoiceSummary(organizationId);

      res.json({
        status: "success",
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/invoices/:id
 * Gets a specific invoice by ID.
 */
invoiceRouter.get(
  "/:id",
  requirePermission("invoices:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const invoice = await invoiceService.getInvoiceById(
        String(req.params.id),
        organizationId,
      );

      res.json({
        status: "success",
        data: { invoice },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/invoices
 * Creates a new invoice.
 */
invoiceRouter.post(
  "/",
  requirePermission("invoices:create"),
  validateBody(createInvoiceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);
      const invoice = await invoiceService.createInvoice({
        ...req.body,
        organizationId,
        createdBy: new Types.ObjectId(user.id),
      });

      res.status(201).json({
        status: "success",
        data: { invoice },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/invoices/:id/pay
 * Records a payment for an invoice.
 */
invoiceRouter.post(
  "/:id/pay",
  requirePermission("invoices:update"),
  validateBody(recordPaymentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);

      const result = await invoiceService.recordPayment({
        id: String(req.params.id),
        organizationId,
        userId: user.id,
        ...req.body,
      });

      res.json({
        status: "success",
        data: { payment: result.payment },
        message:
          result.invoice.status === "paid"
            ? "Factura pagada completamente"
            : `Pago registrado. Saldo pendiente: $${(result.invoice.totalAmount - result.invoice.amountPaid).toFixed(2)}`,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/invoices/:id/void
 * Voids an invoice (using cancelled status).
 */
invoiceRouter.post(
  "/:id/void",
  requirePermission("invoices:delete"),
  validateBody(voidInvoiceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const invoice = await invoiceService.voidInvoice({
        id: String(req.params.id),
        organizationId,
        reason: req.body.reason,
      });

      res.json({
        status: "success",
        data: { invoice },
        message: "Factura anulada exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/invoices/:id/send
 * Sends an invoice to the customer (email notification).
 */
invoiceRouter.post(
  "/:id/send",
  requirePermission("invoices:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      await invoiceService.sendInvoice(String(req.params.id), organizationId);

      res.json({
        status: "success",
        message: "Factura enviada exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default invoiceRouter;

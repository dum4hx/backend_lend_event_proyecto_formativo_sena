import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  Invoice,
  invoiceStatusOptions,
  invoiceTypeOptions,
} from "../modules/invoice/models/invoice.model.ts";
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
  paymentMethodId: z.string(),
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
      const {
        page = 1,
        limit = 20,
        status,
        type,
        customerId,
        loanId,
        overdue,
        sortBy,
        sortOrder,
      } = req.query as unknown as z.infer<typeof listInvoicesQuerySchema>;
      const skip = (page - 1) * limit;

      const query: Record<string, unknown> = { organizationId };

      if (status) {
        query.status = status;
      }
      if (type) {
        query.type = type;
      }
      if (customerId) {
        query.customerId = customerId;
      }
      if (loanId) {
        query.loanId = loanId;
      }
      if (overdue === true) {
        query.status = "pending";
        query.dueDate = { $lt: new Date() };
      }

      const sortField = sortBy ?? "createdAt";
      const sortDirection = sortOrder === "asc" ? 1 : -1;

      const [invoices, total] = await Promise.all([
        Invoice.find(query)
          .skip(skip)
          .limit(limit)
          .populate("customerId", "email name")
          .populate("loanId", "startDate endDate")
          .sort({ [sortField]: sortDirection }),
        Invoice.countDocuments(query),
      ]);

      res.json({
        status: "success",
        data: {
          invoices,
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
 * GET /api/v1/invoices/summary
 * Gets invoice summary/statistics for the organization.
 */
invoiceRouter.get(
  "/summary",
  requirePermission("invoices:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);

      const [pendingStats, paidStats, overdueCount] = await Promise.all([
        Invoice.aggregate([
          { $match: { organizationId, status: "pending" } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              total: { $sum: "$total" },
            },
          },
        ]),
        Invoice.aggregate([
          { $match: { organizationId, status: "paid" } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              total: { $sum: "$total" },
            },
          },
        ]),
        Invoice.countDocuments({
          organizationId,
          status: "pending",
          dueDate: { $lt: new Date() },
        }),
      ]);

      res.json({
        status: "success",
        data: {
          pending: {
            count: pendingStats[0]?.count ?? 0,
            total: pendingStats[0]?.total ?? 0,
          },
          paid: {
            count: paidStats[0]?.count ?? 0,
            total: paidStats[0]?.total ?? 0,
          },
          overdueCount,
        },
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
      const invoice = await Invoice.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
      })
        .populate("customerId", "email name phone address")
        .populate("loanId")
        .populate("inspectionId");

      if (!invoice) {
        throw AppError.notFound("Invoice not found");
      }

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
      const { items, taxRate, dueDate, ...rest } = req.body;

      // Calculate totals
      const subtotal = items.reduce(
        (sum: number, item: { quantity: number; unitPrice: number }) =>
          sum + item.quantity * item.unitPrice,
        0,
      );
      const tax = subtotal * taxRate;
      const total = subtotal + tax;

      const invoice = await Invoice.create({
        ...rest,
        organizationId,
        items,
        subtotal,
        tax,
        total,
        status: "pending",
        dueDate: dueDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
      });

      const populatedInvoice = await Invoice.findById(invoice._id).populate(
        "customerId",
        "email name",
      );

      res.status(201).json({
        status: "success",
        data: { invoice: populatedInvoice },
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
      const invoice = await Invoice.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
        status: "pending",
      });

      if (!invoice) {
        throw AppError.notFound("Invoice not found or not pending");
      }

      const { amount, paymentMethodId, reference, notes } = req.body;

      // Validate payment amount
      const remainingAmount = invoice.totalAmount - (invoice.amountPaid ?? 0);

      if (amount > remainingAmount) {
        throw AppError.badRequest(
          `Payment amount exceeds remaining balance of $${remainingAmount.toFixed(2)}`,
        );
      }

      // Record payment
      invoice.payments = invoice.payments ?? [];
      invoice.payments.push({
        amount,
        method: paymentMethodId ?? "other",
        notes,
        paidAt: new Date(),
      });

      invoice.amountPaid = (invoice.amountPaid ?? 0) + amount;

      // Check if fully paid
      if (invoice.amountPaid >= invoice.totalAmount) {
        invoice.status = "paid";
        invoice.paidAt = new Date();
      } else {
        invoice.status = "partially_paid";
      }

      await invoice.save();

      res.json({
        status: "success",
        data: { invoice },
        message:
          invoice.status === "paid"
            ? "Invoice fully paid"
            : `Payment recorded. Remaining balance: $${(invoice.totalAmount - invoice.amountPaid).toFixed(2)}`,
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
      const invoice = await Invoice.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
        status: { $in: ["pending", "partially_paid"] },
      });

      if (!invoice) {
        throw AppError.notFound("Invoice not found or cannot be voided");
      }

      invoice.status = "cancelled";
      invoice.notes =
        (invoice.notes ?? "") + `\nVoid reason: ${req.body.reason}`;
      await invoice.save();

      res.json({
        status: "success",
        data: { invoice },
        message: "Invoice voided successfully",
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
      const invoice = await Invoice.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
      }).populate("customerId", "email name");

      if (!invoice) {
        throw AppError.notFound("Invoice not found");
      }

      // TODO: Implement email sending logic
      // For now, just update status to pending if draft
      if (invoice.status === "draft") {
        invoice.status = "pending";
      }
      await invoice.save();

      res.json({
        status: "success",
        message: "Invoice sent successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default invoiceRouter;

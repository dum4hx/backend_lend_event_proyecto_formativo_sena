import { Types, startSession } from "mongoose";
import { Invoice, type InvoiceDocument } from "./models/invoice.model.ts";
import { Loan } from "../loan/models/loan.model.ts";
import { PaymentMethod } from "../payment/models/payment_method.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { codeGenerationService } from "../code_scheme/code_generation.service.ts";
import { emailService } from "../../utils/email.ts";

/**
 * Service to handle invoice business logic
 */
export const invoiceService = {
  /**
   * Applies a deposit-backed payment to an invoice in-place (does NOT save).
   * Caller is responsible for saving the invoice (supports session transactions).
   */
  applyDepositPayment(
    invoice: InvoiceDocument,
    depositApplied: number,
    reference?: string,
  ): void {
    if (depositApplied <= 0) return;

    (invoice.payments as any[]).push({
      amount: depositApplied,
      method: "deposit",
      notes: reference ?? "Deposit applied",
      paidAt: new Date(),
    });

    invoice.amountPaid = (invoice.amountPaid ?? 0) + depositApplied;
    // Pre-save hook will recalculate amountDue and status automatically
  },

  /**
   * Lists invoices with filtering, pagination and sorting
   */
  async listInvoices(params: {
    organizationId: Types.ObjectId;
    page?: number;
    limit?: number;
    status?: string | undefined;
    type?: string | undefined;
    customerId?: string | undefined;
    loanId?: string | undefined;
    overdue?: boolean | undefined;
    sortBy?: string | undefined;
    sortOrder?: "asc" | "desc" | undefined;
  }) {
    const {
      organizationId,
      page = 1,
      limit = 20,
      status,
      type,
      customerId,
      loanId,
      overdue,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = params;

    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { organizationId };

    if (status) query.status = status;
    if (type) query.type = type;
    if (customerId) query.customerId = customerId;
    if (loanId) query.loanId = loanId;
    if (overdue === true) {
      query.status = "pending";
      query.dueDate = { $lt: new Date() };
    }

    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .skip(skip)
        .limit(limit)
        .populate("customerId", "email name")
        .populate("loanId", "startDate endDate code")
        .populate({
          path: "payments.paymentMethodId",
          model: "PaymentMethod",
        })
        .sort({ [sortBy]: sortDirection }),
      Invoice.countDocuments(query),
    ]);

    return {
      invoices,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Gets invoice summary statistics
   */
  async getInvoiceSummary(organizationId: Types.ObjectId) {
    const [pendingStats, paidStats, overdueCount] = await Promise.all([
      Invoice.aggregate([
        { $match: { organizationId, status: "pending" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total: { $sum: "$totalAmount" },
          },
        },
      ]),
      Invoice.aggregate([
        { $match: { organizationId, status: "paid" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total: { $sum: "$totalAmount" },
          },
        },
      ]),
      Invoice.countDocuments({
        organizationId,
        $or: [
          { status: "overdue" },
          { status: "pending", dueDate: { $lt: new Date() } },
        ],
      }),
    ]);

    return {
      pending: {
        count: pendingStats[0]?.count ?? 0,
        total: pendingStats[0]?.total ?? 0,
      },
      paid: {
        count: paidStats[0]?.count ?? 0,
        total: paidStats[0]?.total ?? 0,
      },
      overdueCount,
    };
  },

  /**
   * Gets a single invoice by ID
   */
  async getInvoiceById(id: string, organizationId: Types.ObjectId) {
    const invoice = await Invoice.findOne({
      _id: id,
      organizationId,
    })
      .populate("customerId", "email name phone address")
      .populate("loanId")
      .populate("inspectionId")
      .populate({
        path: "payments.paymentMethodId",
        model: "PaymentMethod",
      });

    if (!invoice) {
      throw AppError.notFound("Factura no encontrada");
    }

    return invoice;
  },

  /**
   * Creates a new invoice
   */
  async createInvoice(params: {
    organizationId: Types.ObjectId;
    customerId: string;
    loanId?: string;
    type: string;
    items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      materialInstanceId?: string;
    }>;
    notes?: string;
    dueDate?: string | Date;
    taxRate?: number;
    createdBy: Types.ObjectId;
    invoiceNumber?: string;
  }) {
    const {
      items,
      taxRate = 0,
      dueDate,
      invoiceNumber: providedNumber,
      ...rest
    } = params;

    const invoiceNumber =
      providedNumber ??
      (await codeGenerationService.generateCode({
        organizationId: params.organizationId,
        entityType: "invoice",
      }));

    // Calculate totals
    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    const invoice = new Invoice({
      ...rest,
      invoiceNumber,
      items,
      subtotal,
      tax,
      total,
      status: "pending",
      dueDate: dueDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
    });

    await invoice.save();

    return Invoice.findById(invoice._id).populate("customerId", "email name");
  },

  /**
   * Records a payment against an invoice
   */
  async recordPayment(params: {
    id: string;
    organizationId: Types.ObjectId;
    userId: string;
    amount: number;
    paymentMethodId: string;
    notes?: string;
  }) {
    const { id, organizationId, userId, amount, paymentMethodId, notes } =
      params;

    const invoice = await Invoice.findOne({
      _id: id,
      organizationId,
      status: { $in: ["pending", "partially_paid"] },
    });

    if (!invoice) {
      throw AppError.notFound(
        "Factura no encontrada o no está en estado de pago",
      );
    }

    // Validate paymentMethodId belongs to this organization and is active
    const paymentMethod = await PaymentMethod.findOne({
      _id: paymentMethodId,
      organizationId,
      status: "active",
    });
    if (!paymentMethod) {
      throw AppError.notFound(
        "Método de pago no encontrado o inactivo en esta organización",
      );
    }

    // Validate payment amount
    const remainingAmount = invoice.totalAmount - (invoice.amountPaid ?? 0);

    if (amount > remainingAmount) {
      throw AppError.badRequest(
        `El monto del pago excede el saldo restante de $${remainingAmount.toFixed(2)}`,
      );
    }

    // Record payment
    invoice.payments = invoice.payments ?? [];
    const paymentRecord = {
      amount,
      paymentMethodId: new Types.ObjectId(paymentMethodId),
      method: paymentMethod.name,
      notes,
      paidAt: new Date(),
    };
    invoice.payments.push(paymentRecord as any);

    invoice.amountPaid = (invoice.amountPaid ?? 0) + amount;

    // Check if fully paid
    if (invoice.amountPaid >= invoice.totalAmount) {
      invoice.status = "paid";
      invoice.paidAt = new Date();
    } else {
      invoice.status = "partially_paid";
    }

    await invoice.save();

    return {
      invoice,
      payment: invoice.payments[invoice.payments.length - 1],
    };
  },

  /**
   * Voids (cancels) an invoice.
   * If the invoice is a damage invoice linked to a loan, reverses
   * loan.damageFees and loan.totalAmount accordingly.
   */
  async voidInvoice(params: {
    id: string;
    organizationId: Types.ObjectId;
    reason: string;
  }) {
    const { id, organizationId, reason } = params;

    const session = await startSession();
    let result: InvoiceDocument | undefined;

    try {
      await session.withTransaction(async () => {
        const invoice = await Invoice.findOne(
          {
            _id: id,
            organizationId,
            status: { $in: ["pending", "partially_paid"] },
          },
          null,
          { session },
        );

        if (!invoice) {
          throw AppError.notFound("Factura no encontrada o no se puede anular");
        }

        invoice.status = "cancelled";
        invoice.notes = (invoice.notes ?? "") + `\nVoid reason: ${reason}`;
        await invoice.save({ session });

        // If this is a damage or late_fee invoice, reverse the loan financial summary
        const loanId = (invoice as any).loanId;
        if (
          (invoice.type === "damage" || invoice.type === "late_fee") &&
          loanId
        ) {
          const loan = await Loan.findOne(
            { _id: loanId, organizationId },
            null,
            { session },
          );

          if (loan) {
            const voided = invoice.totalAmount ?? 0;
            if (invoice.type === "damage") {
              (loan as any).damageFees = Math.max(
                0,
                ((loan as any).damageFees ?? 0) - voided,
              );
            } else {
              (loan as any).lateFees = Math.max(
                0,
                ((loan as any).lateFees ?? 0) - voided,
              );
            }
            loan.totalAmount = Math.max(0, (loan.totalAmount ?? 0) - voided);
            await loan.save({ session });
          }
        }

        result = invoice as unknown as InvoiceDocument;
      });

      return result as InvoiceDocument;
    } finally {
      await session.endSession();
    }
  },

  /**
   * Sends an invoice email to the customer and transitions draft → pending.
   */
  async sendInvoice(id: string, organizationId: Types.ObjectId) {
    const invoice = await Invoice.findOne({
      _id: id,
      organizationId,
    }).populate("customerId", "email name");

    if (!invoice) {
      throw AppError.notFound("Factura no encontrada");
    }

    const customer = invoice.customerId as unknown as {
      email: string;
      name: { firstName: string; firstSurname: string };
    };

    if (customer?.email) {
      await emailService.sendInvoiceEmail(
        customer.email,
        customer.name?.firstName ?? "Customer",
        {
          invoiceNumber: invoice.invoiceNumber,
          type: invoice.type,
          lineItems: invoice.lineItems as Array<{
            description: string;
            quantity: number;
            unitPrice: number;
            totalPrice: number;
          }>,
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount ?? 0,
          totalAmount: invoice.totalAmount,
          amountPaid: invoice.amountPaid ?? 0,
          amountDue: invoice.amountDue ?? 0,
          dueDate: invoice.dueDate,
          notes: invoice.notes,
        },
      );
    }

    if (invoice.status === "draft") {
      invoice.status = "pending";
      await invoice.save();
    }

    return invoice;
  },
};

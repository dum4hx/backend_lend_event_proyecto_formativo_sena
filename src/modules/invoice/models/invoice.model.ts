import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Invoice Status ---------- */

export const invoiceStatusOptions = [
  "draft", // Not yet finalized
  "pending", // Awaiting payment
  "paid", // Payment received
  "partially_paid", // Partial payment received
  "overdue", // Past due date
  "cancelled", // Cancelled
  "refunded", // Refunded
] as const;

export type InvoiceStatus = (typeof invoiceStatusOptions)[number];

/* ---------- Invoice Type ---------- */

export const invoiceTypeOptions = [
  "damage", // Damage charges
  "late_fee", // Late return fees
  "deposit_shortfall", // Deposit didn't cover damages
  "additional_service", // Additional services
  "penalty", // Other penalties
] as const;

export type InvoiceType = (typeof invoiceTypeOptions)[number];

/* ---------- Invoice Line Item Schema ---------- */

const invoiceLineItemZodSchema = z.object({
  description: z.string().min(1).max(300).trim(),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().min(0),
  totalPrice: z.number().min(0),
  referenceId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Invalid reference ID format",
    })
    .optional(),
  referenceType: z.enum(["MaterialInstance", "Loan", "Inspection"]).optional(),
});

/* ---------- Zod Schema for API Validation ---------- */

export const InvoiceZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
  customerId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Customer ID format",
  }),
  loanId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Invalid Loan ID format",
    })
    .optional(),
  inspectionId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Invalid Inspection ID format",
    })
    .optional(),
  type: z.enum(invoiceTypeOptions),
  lineItems: z
    .array(invoiceLineItemZodSchema)
    .min(1, "At least one line item required"),
  dueDate: z.coerce.date(),
  notes: z.string().max(1000).trim().optional(),
});

export const InvoiceUpdateZodSchema = z.object({
  lineItems: z.array(invoiceLineItemZodSchema).optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().max(1000).trim().optional(),
});

export type InvoiceInput = z.infer<typeof InvoiceZodSchema>;

/* ---------- Mongoose Sub-Schemas ---------- */

const invoiceLineItemMongooseSchema = new Schema(
  {
    description: {
      type: String,
      required: true,
      maxlength: 300,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
    },
    referenceType: {
      type: String,
      enum: ["MaterialInstance", "Loan", "Inspection"],
    },
  },
  { _id: true },
);

const paymentRecordMongooseSchema = new Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    stripePaymentIntentId: String,
    method: {
      type: String,
      enum: ["stripe", "cash", "bank_transfer", "other"],
      default: "stripe",
    },
    notes: String,
  },
  { _id: true },
);

/* ---------- Invoice Mongoose Schema ---------- */

const invoiceSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    // Auto-generated invoice number
    invoiceNumber: {
      type: String,
      required: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    loanId: {
      type: Schema.Types.ObjectId,
      ref: "Loan",
    },
    inspectionId: {
      type: Schema.Types.ObjectId,
      ref: "Inspection",
    },
    type: {
      type: String,
      enum: invoiceTypeOptions,
      required: true,
    },
    status: {
      type: String,
      enum: invoiceStatusOptions,
      default: "draft",
      index: true,
    },
    // Line items
    lineItems: {
      type: [invoiceLineItemMongooseSchema],
      required: true,
    },
    // Amounts
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    taxRate: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    taxAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    amountPaid: {
      type: Number,
      min: 0,
      default: 0,
    },
    amountDue: {
      type: Number,
      min: 0,
    },
    // Dates
    dueDate: {
      type: Date,
      required: true,
    },
    paidAt: Date,
    // Payment records
    payments: [paymentRecordMongooseSchema],
    // Stripe
    stripePaymentIntentId: String,
    stripeInvoiceId: String,
    // Notes
    notes: {
      type: String,
      maxlength: 1000,
      trim: true,
    },
    // Created by
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ organizationId: 1, customerId: 1 });
invoiceSchema.index({ organizationId: 1, status: 1 });
invoiceSchema.index({ organizationId: 1, dueDate: 1 });
invoiceSchema.index({ organizationId: 1, loanId: 1 });

/* ---------- Pre-save Middleware ---------- */

invoiceSchema.pre("save", function () {
  // Calculate amounts
  this.subtotal = this.lineItems.reduce(
    (sum, item) => sum + item.totalPrice,
    0,
  );
  this.taxAmount = this.subtotal * (this.taxRate ?? 0);
  this.totalAmount = this.subtotal + this.taxAmount;
  this.amountDue = this.totalAmount - (this.amountPaid ?? 0);

  // Update status based on payment
  if (
    this.amountDue <= 0 &&
    this.status !== "refunded" &&
    this.status !== "cancelled"
  ) {
    this.status = "paid";
    this.paidAt = this.paidAt ?? new Date();
  } else if (this.amountPaid > 0 && this.amountDue > 0) {
    this.status = "partially_paid";
  }

  // Check for overdue
  if (this.status === "pending" && this.dueDate < new Date()) {
    this.status = "overdue";
  }
});

/* ---------- Export ---------- */

export type InvoiceDocument = InferSchemaType<typeof invoiceSchema>;
export const Invoice = model<InvoiceDocument>("Invoice", invoiceSchema);

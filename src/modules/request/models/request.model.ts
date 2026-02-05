import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Request Status ---------- */

export const requestStatusOptions = [
  "pending", // Awaiting approval
  "approved", // Approved, waiting for deposit
  "deposit_pending", // Approved, deposit payment initiated
  "assigned", // Materials assigned
  "ready", // Ready for checkout
  "expired", // Deposit not paid in time
  "rejected", // Request rejected
  "cancelled", // Cancelled by user
] as const;

export type RequestStatus = (typeof requestStatusOptions)[number];

/* ---------- Request Item Schema ---------- */

const requestItemZodSchema = z.object({
  type: z.enum(["material", "package"]),
  referenceId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid reference ID format",
  }),
  quantity: z.number().int().positive().default(1),
});

/* ---------- Zod Schema for API Validation ---------- */

export const LoanRequestZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
  customerId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Customer ID format",
  }),
  items: z.array(requestItemZodSchema).min(1, "At least one item is required"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  notes: z.string().max(1000).trim().optional(),
});

export const LoanRequestUpdateZodSchema = z.object({
  items: z.array(requestItemZodSchema).min(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  notes: z.string().max(1000).trim().optional(),
});

export const RequestApprovalZodSchema = z.object({
  approved: z.boolean(),
  depositAmount: z.number().min(0).optional(),
  rejectionReason: z.string().max(500).trim().optional(),
  depositDueDate: z.coerce.date().optional(),
});

export type LoanRequestInput = z.infer<typeof LoanRequestZodSchema>;

/* ---------- Mongoose Sub-Schemas ---------- */

const requestItemMongooseSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["material", "package"],
      required: true,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "items.type",
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    // Calculated fields (populated on approval)
    pricePerDay: { type: Number, min: 0 },
    totalPrice: { type: Number, min: 0 },
  },
  { _id: false },
);

const assignedMaterialSchema = new Schema(
  {
    materialInstanceId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialInstance",
      required: true,
    },
    itemIndex: { type: Number, required: true }, // Reference to which request item
  },
  { _id: false },
);

/* ---------- Loan Request Mongoose Schema ---------- */

const loanRequestSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [requestItemMongooseSchema],
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: requestStatusOptions,
      default: "pending",
      index: true,
    },
    notes: {
      type: String,
      maxlength: 1000,
      trim: true,
    },
    // Approval fields
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: Date,
    rejectionReason: String,
    // Deposit fields
    depositAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    depositDueDate: Date,
    depositPaidAt: Date,
    depositPaymentIntentId: String, // Stripe Payment Intent ID
    // Assignment fields
    assignedMaterials: [assignedMaterialSchema],
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    assignedAt: Date,
    // Calculated totals
    totalDays: { type: Number, min: 1 },
    subtotal: { type: Number, min: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0 },
    // Expiration
    expiresAt: Date,
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

loanRequestSchema.index({ organizationId: 1, customerId: 1 });
loanRequestSchema.index({ organizationId: 1, status: 1 });
loanRequestSchema.index({ organizationId: 1, createdAt: -1 });
loanRequestSchema.index({ organizationId: 1, startDate: 1, endDate: 1 });
loanRequestSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { status: "deposit_pending" },
  },
);

/* ---------- Pre-save Middleware ---------- */

loanRequestSchema.pre("save", function () {
  // Calculate total days
  if (this.startDate && this.endDate) {
    const diffTime = this.endDate.getTime() - this.startDate.getTime();
    this.totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
});

/* ---------- Export ---------- */

export type LoanRequestDocument = InferSchemaType<typeof loanRequestSchema>;
export const LoanRequest = model<LoanRequestDocument>(
  "LoanRequest",
  loanRequestSchema,
);

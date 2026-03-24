import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Loan Status ---------- */

export const loanStatusOptions = [
  "active", // Checked out
  "returned", // Returned, pending inspection
  "inspected", // Inspection complete
  "closed", // Fully closed
  "overdue", // Past due date
] as const;

export type LoanStatus = (typeof loanStatusOptions)[number];

// Zod enum for loan status
export const LoanStatusZod = z.enum(loanStatusOptions);
export type LoanStatusZodType = z.infer<typeof LoanStatusZod>;

/* ---------- Condition Option Enums & Zod Schemas ---------- */

export const conditionAtCheckoutOptions = [
  "excellent",
  "good",
  "fair",
  "poor",
] as const;

export const conditionAtReturnOptions = [
  "excellent",
  "good",
  "fair",
  "poor",
  "damaged",
  "lost",
] as const;

export const ConditionAtCheckoutZod = z.enum(conditionAtCheckoutOptions);
export type ConditionAtCheckoutZodType = z.infer<typeof ConditionAtCheckoutZod>;

export const ConditionAtReturnZod = z.enum(conditionAtReturnOptions);
export type ConditionAtReturnZodType = z.infer<typeof ConditionAtReturnZod>;

/* ---------- Material Instance in Loan ---------- */

const loanMaterialInstanceZodSchema = z.object({
  materialInstanceId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Material Instance ID format",
  }),
  materialTypeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Material Type ID format",
  }),
});

/* ---------- Zod Schema for API Validation ---------- */

export const LoanZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
  requestId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Request ID format",
  }),
  customerId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Customer ID format",
  }),
  materialInstances: z
    .array(loanMaterialInstanceZodSchema)
    .min(1, "At least one material is required"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  depositAmount: z.number().min(0).default(0),
  totalAmount: z.number().min(0),
});

export type LoanInput = z.infer<typeof LoanZodSchema>;

/* ---------- Mongoose Sub-Schemas ---------- */

/* ---------- Pricing Snapshot Sub-Schema ---------- */

const loanPricingSnapshotSchema = new Schema(
  {
    itemType: {
      type: String,
      enum: ["material", "package"],
      required: true,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    strategyType: {
      type: String,
      required: true,
    },
    configId: {
      type: Schema.Types.ObjectId,
    },
    durationInDays: {
      type: Number,
      required: true,
      min: 1,
    },
    basePricePerDay: {
      type: Number,
      required: true,
      min: 0,
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
  },
  { _id: false },
);

const loanMaterialInstanceSchema = new Schema(
  {
    materialInstanceId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialInstance",
      required: true,
    },
    materialTypeId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialType",
      required: true,
    },
    // Condition tracking
    conditionAtCheckout: {
      type: String,
      enum: (() => {
        return conditionAtCheckoutOptions as unknown as string[];
      })(),
    },
    conditionAtReturn: {
      type: String,
      enum: (() => {
        return conditionAtReturnOptions as unknown as string[];
      })(),
    },
    notes: String,
  },
  { _id: false },
);

/* ---------- Loan Mongoose Schema ---------- */

const loanSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    requestId: {
      type: Schema.Types.ObjectId,
      ref: "LoanRequest",
      required: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    // User references
    checkedOutBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    returnedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    // Dates
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    checkedOutAt: {
      type: Date,
      default: Date.now,
    },
    returnedAt: Date,
    // Materials
    materialInstances: {
      type: [loanMaterialInstanceSchema],
      required: true,
    },
    // Pricing snapshot — frozen at checkout time; never updated retroactively
    pricingSnapshot: {
      type: [loanPricingSnapshotSchema],
      default: [],
    },
    // Financial
    depositAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    depositRefunded: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalAmount: {
      type: Number,
      min: 0,
      required: true,
    },
    damageFees: {
      type: Number,
      min: 0,
      default: 0,
    },
    lateFees: {
      type: Number,
      min: 0,
      default: 0,
    },
    // Status
    status: {
      type: String,
      enum: loanStatusOptions,
      default: "active",
      index: true,
    },
    // Contract
    contractUrl: String,
    // Notes
    notes: {
      type: String,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

loanSchema.index({ organizationId: 1, customerId: 1 });
loanSchema.index({ organizationId: 1, status: 1 });
loanSchema.index({ organizationId: 1, endDate: 1 });
loanSchema.index({ organizationId: 1, createdAt: -1 });
loanSchema.index({ "materialInstances.materialInstanceId": 1 });

/* ---------- Pre-save Middleware ---------- */

loanSchema.pre("save", function () {
  const now = new Date();

  // Auto-update to overdue if past end date and still active
  if (this.status === "active" && this.endDate < now && !this.returnedAt) {
    this.status = "overdue";
  }
});

/* ---------- Export ---------- */

export type LoanDocument = InferSchemaType<typeof loanSchema>;
export const Loan = model<LoanDocument>("Loan", loanSchema);

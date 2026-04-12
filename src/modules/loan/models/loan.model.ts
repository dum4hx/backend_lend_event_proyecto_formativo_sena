import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";
import {
  conditionAtCheckoutOptions,
  conditionAtReturnOptions,
} from "../../shared/condition_levels.ts";

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

// Re-export condition options from shared module
export { conditionAtCheckoutOptions, conditionAtReturnOptions };

export const ConditionAtCheckoutZod = z.enum(
  conditionAtCheckoutOptions as unknown as [string, ...string[]],
);
export type ConditionAtCheckoutZodType = z.infer<typeof ConditionAtCheckoutZod>;

export const ConditionAtReturnZod = z.enum(
  conditionAtReturnOptions as unknown as [string, ...string[]],
);
export type ConditionAtReturnZodType = z.infer<typeof ConditionAtReturnZod>;

/* ---------- Material Instance in Loan ---------- */

const loanMaterialInstanceZodSchema = z.object({
  materialInstanceId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de instancia de material no válido",
  }),
  materialTypeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de tipo de material no válido",
  }),
});

/* ---------- Zod Schema for API Validation ---------- */

export const LoanZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de organización no válido",
  }),
  requestId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de solicitud no válido",
  }),
  customerId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de cliente no válido",
  }),
  materialInstances: z
    .array(loanMaterialInstanceZodSchema)
    .min(1, "Se requiere al menos un material"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  deposit: z
    .object({
      amount: z.number().min(0).default(0),
    })
    .optional(),
  totalAmount: z.number().min(0),
});

export type LoanInput = z.infer<typeof LoanZodSchema>;

/* ---------- Deposit Enums ---------- */

export const depositStatusOptions = [
  "not_required",
  "held",
  "partially_applied",
  "applied",
  "refund_pending",
  "refunded",
] as const;

export type DepositStatus = (typeof depositStatusOptions)[number];

export const depositTransactionTypeOptions = [
  "held",
  "applied",
  "refund",
] as const;
export type DepositTransactionType =
  (typeof depositTransactionTypeOptions)[number];

/* ---------- Mongoose Sub-Schemas ---------- */

/* ---------- Deposit Transaction Sub-Schema ---------- */

const depositTransactionSchema = new Schema(
  {
    type: {
      type: String,
      enum: depositTransactionTypeOptions,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    reference: {
      type: String,
    },
  },
  { _id: false },
);

/* ---------- Deposit Sub-Schema ---------- */

const depositSchema = new Schema(
  {
    amount: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: depositStatusOptions,
      default: "not_required",
    },
    transactions: {
      type: [depositTransactionSchema],
      default: [],
    },
  },
  { _id: false },
);

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
      enum: conditionAtCheckoutOptions,
    },
    conditionAtReturn: {
      type: String,
      enum: conditionAtReturnOptions,
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
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
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
    // Origin location (the location from which the materials were checked out)
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    // User references
    preparedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
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
    preparedAt: Date,
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
    deposit: {
      type: depositSchema,
      default: () => ({ amount: 0, status: "not_required", transactions: [] }),
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
    extensionFees: {
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
    // Scheduler tracking
    lastRefundReminderSentAt: Date,
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

loanSchema.index({ organizationId: 1, code: 1 }, { unique: true });
loanSchema.index({ organizationId: 1, customerId: 1 });
loanSchema.index({ organizationId: 1, requestId: 1 });
loanSchema.index({ organizationId: 1, status: 1 });
loanSchema.index({ organizationId: 1, endDate: 1 });
loanSchema.index({ organizationId: 1, createdAt: -1 });
loanSchema.index({ organizationId: 1, locationId: 1 });
loanSchema.index({
  organizationId: 1,
  "materialInstances.materialInstanceId": 1,
  createdAt: -1,
});
loanSchema.index({ "materialInstances.materialInstanceId": 1 });

/* ---------- Export ---------- */

export type LoanDocument = InferSchemaType<typeof loanSchema>;
export const Loan = model<LoanDocument>("Loan", loanSchema);

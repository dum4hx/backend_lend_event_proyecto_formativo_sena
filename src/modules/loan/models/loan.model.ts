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
      enum: ["excellent", "good", "fair", "poor"],
    },
    conditionAtReturn: {
      type: String,
      enum: ["excellent", "good", "fair", "poor", "damaged", "lost"],
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

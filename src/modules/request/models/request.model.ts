import { z } from "zod";
import {
  Schema,
  model,
  type InferSchemaType,
  Types,
  type ClientSession,
} from "mongoose";
import {
  MaterialInstance,
  type MaterialInstanceDocument,
} from "../../material/models/material_instance.model.ts";
import { required } from "zod/mini";

/* ---------- Request Status ---------- */

export const requestStatusOptions = [
  "pending", // Awaiting approval
  "approved", // Approved, waiting for deposit
  "deposit_pending", // Approved, deposit payment initiated
  "assigned", // Materials assigned
  "ready", // Ready for checkout — payment must be recorded before checkout
  "shipped", // Materials dispatched / handed off — a loan has been created
  "completed", // Request fulfilled — linked loan is active
  "expired", // Deposit not paid in time
  "rejected", // Request rejected
  "cancelled", // Cancelled by user
] as const;

export type RequestStatus = (typeof requestStatusOptions)[number];

/* ---------- Request Item Schema ---------- */

const requestItemZodSchema = z.object({
  type: z.enum(["material", "package"]),
  referenceId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de referencia no válido",
  }),
  quantity: z.number().int().positive().default(1),
});

/* ---------- Zod Schema for API Validation ---------- */

export const LoanRequestBaseZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de organización no válido",
  }),
  customerId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de cliente no válido",
  }),
  items: z
    .array(requestItemZodSchema)
    .min(1, "Se requiere al menos un elemento"),
  depositDueDate: z.coerce.date(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  notes: z.string().max(1000).trim().optional(),
});

export const LoanRequestZodSchema = LoanRequestBaseZodSchema.refine(
  (data) => data.depositDueDate >= data.startDate,
  {
    message:
      "La fecha límite de depósito no puede ser anterior a la fecha de inicio",
    path: ["depositDueDate"],
  },
).refine((data) => data.depositDueDate <= data.endDate, {
  message:
    "La fecha límite de depósito no puede ser posterior a la fecha de fin",
  path: ["depositDueDate"],
});

export const LoanRequestUpdateZodSchema = z
  .object({
    items: z.array(requestItemZodSchema).min(1).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    depositDueDate: z.coerce.date(),
    notes: z.string().max(1000).trim().optional(),
  })
  .refine((data) => !data.startDate || data.depositDueDate >= data.startDate, {
    message:
      "La fecha límite de depósito no puede ser anterior a la fecha de inicio",
    path: ["depositDueDate"],
  })
  .refine((data) => !data.endDate || data.depositDueDate <= data.endDate, {
    message:
      "La fecha límite de depósito no puede ser posterior a la fecha de fin",
    path: ["depositDueDate"],
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
    // Pricing metadata — stored for snapshot building at loan creation time
    pricingConfigId: { type: Schema.Types.ObjectId },
    pricingStrategyType: { type: String },
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
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
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
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
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
    depositDueDate: {
      type: Date,
      required: true,
    },
    depositPaidAt: {
      type: Date,
    },
    depositPaymentIntentId: {
      type: String,
    }, // Stripe Payment Intent ID

    // Rental fee tracking
    rentalFeePaidAt: {
      type: Date,
    },

    // Assignment fields
    assignedMaterials: [assignedMaterialSchema],
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    assignedAt: {
      type: Date,
    },
    preparedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    preparedAt: {
      type: Date,
    },
    // Calculated totals
    totalDays: { type: Number, min: 1 },
    subtotal: { type: Number, min: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0 },
    // Expiration
    expiresAt: { type: Date },
    // Fulfillment — set when a loan is created from this request
    loanId: {
      type: Schema.Types.ObjectId,
      ref: "Loan",
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

loanRequestSchema.index({ organizationId: 1, code: 1 }, { unique: true });
loanRequestSchema.index({ organizationId: 1, customerId: 1 });
loanRequestSchema.index({ organizationId: 1, status: 1 });
loanRequestSchema.index({
  organizationId: 1,
  "assignedMaterials.materialInstanceId": 1,
  status: 1,
  createdAt: -1,
});
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

// Instance helper: mark all currently assigned material instances as 'loaned'
loanRequestSchema.methods.markAssignedMaterialsLoaned = async function (
  this: any,
  session?: ClientSession,
): Promise<Types.ObjectId[]> {
  const assigned: InferSchemaType<typeof assignedMaterialSchema>[] =
    this.assignedMaterials ?? [];
  const instanceIds = assigned
    .map((am) => am.materialInstanceId as unknown as Types.ObjectId)
    .filter(Boolean);

  if (instanceIds.length === 0) {
    return [];
  }

  const filter = { _id: { $in: instanceIds } };
  const update = { $set: { status: "loaned" } };
  const opts = session ? { session } : undefined;

  await MaterialInstance.updateMany(filter, update, opts as any);
  return instanceIds;
};

/* ---------- Export ---------- */

export interface LoanRequestMethods {
  markAssignedMaterialsLoaned(
    session?: ClientSession,
  ): Promise<Types.ObjectId[]>;
}

export type LoanRequestDocument = InferSchemaType<typeof loanRequestSchema> &
  LoanRequestMethods;

export const LoanRequest = model<LoanRequestDocument>(
  "LoanRequest",
  loanRequestSchema,
);

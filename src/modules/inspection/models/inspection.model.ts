import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Inspection Status ---------- */

export const inspectionStatusOptions = [
  "pending", // Awaiting inspection
  "in_progress", // Inspection started
  "completed", // Inspection finished
] as const;

export type InspectionStatus = (typeof inspectionStatusOptions)[number];

/* ---------- Condition Options ---------- */

export const conditionOptions = [
  "excellent",
  "good",
  "fair",
  "poor",
  "damaged",
  "lost",
] as const;

export type ItemCondition = (typeof conditionOptions)[number];

/* ---------- Item Inspection Schema ---------- */

const itemInspectionZodSchema = z.object({
  materialInstanceId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Material Instance ID format",
  }),
  conditionBefore: z.enum(conditionOptions),
  conditionAfter: z.enum(conditionOptions),
  damageDescription: z.string().max(500).trim().optional(),
  evidenceUrls: z.array(z.url()).max(10).optional(),
  repairRequired: z.boolean().default(false),
  estimatedRepairCost: z.number().min(0).optional(),
  chargeToCustomer: z.number().min(0).optional(),
});

/* ---------- Zod Schema for API Validation ---------- */

export const InspectionZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
  loanId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Loan ID format",
  }),
  items: z
    .array(itemInspectionZodSchema)
    .min(1, "At least one item inspection required"),
  notes: z.string().max(1000).trim().optional(),
});

export const InspectionUpdateZodSchema = z.object({
  items: z.array(itemInspectionZodSchema).optional(),
  notes: z.string().max(1000).trim().optional(),
});

export const ItemInspectionUpdateZodSchema = itemInspectionZodSchema.partial();

export type InspectionInput = z.infer<typeof InspectionZodSchema>;

/* ---------- Mongoose Sub-Schemas ---------- */

const itemInspectionMongooseSchema = new Schema(
  {
    materialInstanceId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialInstance",
      required: true,
    },
    conditionBefore: {
      type: String,
      enum: conditionOptions,
      required: true,
    },
    conditionAfter: {
      type: String,
      enum: conditionOptions,
      required: true,
    },
    damageDescription: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    evidenceUrls: {
      type: [String],
      validate: {
        validator: (v: string[]) => v.length <= 10,
        message: "Maximum 10 evidence URLs allowed",
      },
    },
    repairRequired: {
      type: Boolean,
      default: false,
    },
    estimatedRepairCost: {
      type: Number,
      min: 0,
    },
    chargeToCustomer: {
      type: Number,
      min: 0,
      default: 0,
    },
    // Transition tracking
    transitionedToStatus: {
      type: String,
      enum: ["available", "maintenance", "damaged", "retired"],
    },
  },
  { _id: true },
);

/* ---------- Inspection Mongoose Schema ---------- */

const inspectionSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    loanId: {
      type: Schema.Types.ObjectId,
      ref: "Loan",
      required: true,
    },
    inspectedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: inspectionStatusOptions,
      default: "pending",
      index: true,
    },
    items: {
      type: [itemInspectionMongooseSchema],
      required: true,
    },
    notes: {
      type: String,
      maxlength: 1000,
      trim: true,
    },
    // Summary fields
    totalDamageCost: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalChargedToCustomer: {
      type: Number,
      min: 0,
      default: 0,
    },
    coveredByDeposit: {
      type: Number,
      min: 0,
      default: 0,
    },
    additionalChargeRequired: {
      type: Number,
      min: 0,
      default: 0,
    },
    // Timestamps
    startedAt: Date,
    completedAt: Date,
    // Invoice reference (if additional charge required)
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

inspectionSchema.index({ organizationId: 1, loanId: 1 });
inspectionSchema.index({ organizationId: 1, status: 1 });
inspectionSchema.index({ organizationId: 1, createdAt: -1 });
inspectionSchema.index({ inspectedBy: 1 });

/* ---------- Export ---------- */

export type InspectionDocument = InferSchemaType<typeof inspectionSchema>;
export const Inspection = model<InspectionDocument>(
  "Inspection",
  inspectionSchema,
);

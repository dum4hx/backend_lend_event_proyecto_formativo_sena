import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Batch Status ---------- */

export const batchStatusOptions = [
  "draft",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type BatchStatus = (typeof batchStatusOptions)[number];

/* ---------- Item Status ---------- */

export const itemStatusOptions = [
  "pending",
  "in_repair",
  "repaired",
  "unrecoverable",
  "cancelled",
] as const;

export type ItemStatus = (typeof itemStatusOptions)[number];

/* ---------- Entry Reason ---------- */

export const entryReasonOptions = ["damaged", "lost", "other"] as const;

export type EntryReason = (typeof entryReasonOptions)[number];

/* ---------- Source Type ---------- */

export const sourceTypeOptions = ["inspection", "incident", "manual"] as const;

export type SourceType = (typeof sourceTypeOptions)[number];

/* ---------- Zod: Add-Item Schema ---------- */

const maintenanceBatchItemZodSchema = z.object({
  materialInstanceId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de instancia de material no válido",
  }),
  entryReason: z.enum(entryReasonOptions),
  sourceType: z.enum(sourceTypeOptions),
  sourceId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Formato de ID de fuente no válido",
    })
    .optional(),
  sourceItemIndex: z.number().int().min(0).optional(),
  estimatedCost: z.number().min(0).optional(),
  repairNotes: z.string().max(500).trim().optional(),
});

export const MaintenanceBatchItemAddZodSchema = z.object({
  items: z
    .array(maintenanceBatchItemZodSchema)
    .min(1, "Se requiere al menos un elemento"),
});

export type MaintenanceBatchItemInput = z.infer<
  typeof maintenanceBatchItemZodSchema
>;

/* ---------- Zod: Create-Batch Schema ---------- */

export const MaintenanceBatchCreateZodSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(1000).trim().optional(),
  scheduledStartDate: z
    .preprocess(
      (val) => (typeof val === "string" ? new Date(val) : val),
      z.date(),
    )
    .optional(),
  scheduledEndDate: z
    .preprocess(
      (val) => (typeof val === "string" ? new Date(val) : val),
      z.date(),
    )
    .optional(),
  assignedTo: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Formato de ID de usuario no válido",
    })
    .optional(),
  locationId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Formato de ID de ubicación no válido",
    })
    .optional(),
  notes: z.string().max(1000).trim().optional(),
});

export type MaintenanceBatchCreateInput = z.infer<
  typeof MaintenanceBatchCreateZodSchema
>;

/* ---------- Zod: Update-Batch Schema ---------- */

export const MaintenanceBatchUpdateZodSchema =
  MaintenanceBatchCreateZodSchema.partial();

/* ---------- Zod: Resolve-Item Schema ---------- */

export const MaintenanceBatchResolveItemZodSchema = z.object({
  resolution: z.enum(["repaired", "unrecoverable"]),
  actualCost: z.number().min(0).optional(),
  repairNotes: z.string().max(500).trim().optional(),
});

export type MaintenanceBatchResolveItemInput = z.infer<
  typeof MaintenanceBatchResolveItemZodSchema
>;

/* ---------- Mongoose Sub-Schema: Item ---------- */

const maintenanceBatchItemMongooseSchema = new Schema(
  {
    materialInstanceId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialInstance",
      required: true,
    },
    entryReason: {
      type: String,
      enum: entryReasonOptions,
      required: true,
    },
    itemStatus: {
      type: String,
      enum: itemStatusOptions,
      default: "pending",
    },
    sourceType: {
      type: String,
      enum: sourceTypeOptions,
      required: true,
    },
    sourceId: {
      type: Schema.Types.ObjectId,
    },
    sourceItemIndex: {
      type: Number,
    },
    estimatedCost: {
      type: Number,
      min: 0,
    },
    actualCost: {
      type: Number,
      min: 0,
    },
    repairNotes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    resolvedAt: {
      type: Date,
    },
  },
  { _id: true },
);

/* ---------- Mongoose Schema: Batch ---------- */

const maintenanceBatchSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 200,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 1000,
      trim: true,
    },
    status: {
      type: String,
      enum: batchStatusOptions,
      default: "draft",
    },
    scheduledStartDate: { type: Date },
    scheduledEndDate: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
    },
    totalEstimatedCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalActualCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
      maxlength: 1000,
      trim: true,
    },
    items: [maintenanceBatchItemMongooseSchema],
  },
  { timestamps: true },
);

/* ---------- Indexes ---------- */

maintenanceBatchSchema.index({ organizationId: 1, status: 1 });
maintenanceBatchSchema.index({
  organizationId: 1,
  "items.materialInstanceId": 1,
});

/* ---------- Model ---------- */

export type MaintenanceBatchDocument = InferSchemaType<
  typeof maintenanceBatchSchema
>;
export const MaintenanceBatch = model(
  "MaintenanceBatch",
  maintenanceBatchSchema,
);

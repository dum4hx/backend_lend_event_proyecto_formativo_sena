import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Incident Enums ---------- */

export const incidentTypeOptions = [
  "damage",
  "lost",
  "overdue",
  "issue",
  "replacement",
  "extended",
  "other",
] as const;
export type IncidentType = (typeof incidentTypeOptions)[number];

export const incidentStatusOptions = [
  "open",
  "acknowledged",
  "resolved",
  "dismissed",
] as const;
export type IncidentStatus = (typeof incidentStatusOptions)[number];

export const incidentSeverityOptions = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type IncidentSeverity = (typeof incidentSeverityOptions)[number];

export const incidentSourceTypeOptions = [
  "inspection",
  "scheduler",
  "manual",
] as const;
export type IncidentSourceType = (typeof incidentSourceTypeOptions)[number];

export const incidentContextOptions = [
  "transit",
  "storage",
  "loan",
  "maintenance",
  "other",
] as const;
export type IncidentContext = (typeof incidentContextOptions)[number];

/* ---------- Zod Schemas ---------- */

export const IncidentZodSchema = z
  .object({
    loanId: z
      .string()
      .refine((val) => Types.ObjectId.isValid(val), {
        message: "Formato de ID de préstamo no válido",
      })
      .optional(),
    locationId: z
      .string()
      .refine((val) => Types.ObjectId.isValid(val), {
        message: "Formato de ID de ubicación no válido",
      })
      .optional(),
    context: z.enum(incidentContextOptions),
    type: z.enum(incidentTypeOptions),
    severity: z.enum(incidentSeverityOptions).optional(),
    relatedMaterialInstances: z
      .array(
        z.string().refine((val) => Types.ObjectId.isValid(val), {
          message: "Formato de ID de instancia de material no válido",
        }),
      )
      .optional(),
    description: z.string().max(2000).optional(),
    financialImpact: z
      .object({
        estimated: z.number().min(0).optional(),
        actual: z.number().min(0).optional(),
        currency: z.string().max(10).optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) => {
      if (data.context === "loan" && !data.loanId) return false;
      return true;
    },
    {
      message: 'loanId es requerido cuando el contexto es "loan"',
      path: ["loanId"],
    },
  );

export type IncidentInput = z.infer<typeof IncidentZodSchema>;

export const ResolveIncidentZodSchema = z.object({
  resolution: z.string().min(1).max(1000),
});

export const DismissIncidentZodSchema = z.object({
  resolution: z.string().max(1000).optional(),
});

/* ---------- Financial Impact Sub-Schema ---------- */

const financialImpactSchema = new Schema(
  {
    estimated: { type: Number, min: 0 },
    actual: { type: Number, min: 0 },
    currency: { type: String, maxlength: 10 },
  },
  { _id: false },
);

/* ---------- Mongoose Schema ---------- */

const incidentSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    incidentNumber: {
      type: String,
      required: true,
      immutable: true,
    },
    loanId: {
      type: Schema.Types.ObjectId,
      ref: "Loan",
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      index: true,
    },
    context: {
      type: String,
      enum: incidentContextOptions,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: incidentTypeOptions,
      required: true,
    },
    status: {
      type: String,
      enum: incidentStatusOptions,
      default: "open",
      index: true,
    },
    severity: {
      type: String,
      enum: incidentSeverityOptions,
    },
    relatedMaterialInstances: [
      {
        type: Schema.Types.ObjectId,
        ref: "MaterialInstance",
      },
    ],
    sourceType: {
      type: String,
      enum: incidentSourceTypeOptions,
      required: true,
    },
    sourceId: {
      type: Schema.Types.ObjectId,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    financialImpact: {
      type: financialImpactSchema,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    resolvedAt: Date,
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    resolution: {
      type: String,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

incidentSchema.index({ organizationId: 1, loanId: 1 });
incidentSchema.index({ organizationId: 1, status: 1 });
incidentSchema.index({ organizationId: 1, type: 1 });
incidentSchema.index({ organizationId: 1, context: 1, status: 1 });
incidentSchema.index({ organizationId: 1, createdAt: -1 });

// Source lookup index (performance only; no uniqueness constraints)
incidentSchema.index({
  organizationId: 1,
  sourceType: 1,
  sourceId: 1,
  type: 1,
});
incidentSchema.index(
  { organizationId: 1, incidentNumber: 1 },
  { unique: true },
);

/* ---------- Export ---------- */

export type IncidentDocument = InferSchemaType<typeof incidentSchema>;
export const Incident = model<IncidentDocument>("Incident", incidentSchema);

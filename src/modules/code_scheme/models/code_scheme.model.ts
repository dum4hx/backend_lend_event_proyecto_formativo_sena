import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Entity Type Enum ---------- */

export const entityTypeOptions = ["loan", "loan_request"] as const;
export type EntityType = (typeof entityTypeOptions)[number];

/* ---------- Zod Schemas ---------- */

export const CodeSchemeZodSchema = z.object({
  entityType: z.enum(entityTypeOptions),
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .trim(),
  pattern: z
    .string()
    .min(1, "El patrón es requerido")
    .max(50, "El patrón no puede exceder 50 caracteres")
    .trim(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export const CodeSchemeUpdateZodSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .trim()
    .optional(),
  pattern: z
    .string()
    .min(1, "El patrón es requerido")
    .max(50, "El patrón no puede exceder 50 caracteres")
    .trim()
    .optional(),
  isActive: z.boolean().optional(),
});

export type CodeSchemeInput = z.infer<typeof CodeSchemeZodSchema>;
export type CodeSchemeUpdateInput = z.infer<typeof CodeSchemeUpdateZodSchema>;

/* ---------- Mongoose Schema ---------- */

const codeSchemeSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: entityTypeOptions,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    pattern: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

// No duplicate scheme names per org + entity type
codeSchemeSchema.index(
  { organizationId: 1, entityType: 1, name: 1 },
  { unique: true },
);

// At most one default scheme per org + entity type
codeSchemeSchema.index(
  { organizationId: 1, entityType: 1, isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true },
  },
);

/* ---------- Export ---------- */

export type CodeSchemeDocument = InferSchemaType<typeof codeSchemeSchema>;
export const CodeScheme = model<CodeSchemeDocument>(
  "CodeScheme",
  codeSchemeSchema,
);

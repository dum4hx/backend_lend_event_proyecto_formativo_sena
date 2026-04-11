import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Entity Type Enum ---------- */

export const entityTypeOptions = [
  "loan",
  "invoice",
  "inspection",
  "incident",
  "maintenance_batch",
  "material_instance",
] as const;
export type EntityType = (typeof entityTypeOptions)[number];

/* ---------- Zod Schemas ---------- */

export const CodeSchemeZodSchema = z
  .object({
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
    materialTypeId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, "Formato de ID de tipo de material no válido")
      .optional(),
    categoryId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, "Formato de ID de categoría no válido")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.entityType !== "material_instance") {
      if (data.materialTypeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "materialTypeId solo es permitido para el tipo de entidad 'material_instance'",
          path: ["materialTypeId"],
        });
      }
      if (data.categoryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "categoryId solo es permitido para el tipo de entidad 'material_instance'",
          path: ["categoryId"],
        });
      }
    }
    if (data.materialTypeId && data.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "No se puede establecer materialTypeId y categoryId al mismo tiempo",
        path: ["materialTypeId"],
      });
    }
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
    materialTypeId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialType",
      default: null,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

// No duplicate scheme names per org + entity type + scope
codeSchemeSchema.index(
  {
    organizationId: 1,
    entityType: 1,
    materialTypeId: 1,
    categoryId: 1,
    name: 1,
  },
  { unique: true },
);

// At most one default scheme per org + entity type + scope
codeSchemeSchema.index(
  {
    organizationId: 1,
    entityType: 1,
    materialTypeId: 1,
    categoryId: 1,
    isDefault: 1,
  },
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

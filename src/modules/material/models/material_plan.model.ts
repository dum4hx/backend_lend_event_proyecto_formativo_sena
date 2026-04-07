import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

// Zod schema for API validation
export const MaterialPlanZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de organización no válido",
  }),
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(150, "Máximo 150 caracteres")
    .trim(),
  description: z
    .string()
    .min(1, "La descripción es requerida")
    .max(500, "Máximo 500 caracteres")
    .trim(),
  materialTypeIds: z
    .array(
      z.string().refine((val) => Types.ObjectId.isValid(val), {
        message: "Formato de ID de modelo de material no válido",
      }),
    )
    .min(1, "Se requiere al menos un modelo de material"),
  discountRate: z
    .number()
    .min(0, "La tasa de descuento debe ser no negativa")
    .max(1, "La tasa de descuento debe estar entre 0 y 1"),
});

export type MaterialPlanInput = z.infer<typeof MaterialPlanZodSchema>;

// Material Plan mongoose schema
const materialPlanSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 150,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 500,
      trim: true,
    },
    materialTypeIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "MaterialModel",
        required: true,
      },
    ],
    discountRate: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Compound unique: name unique per organization (not globally)
materialPlanSchema.index({ organizationId: 1, name: 1 }, { unique: true });
// Index for better query performance
materialPlanSchema.index({ materialTypeIds: 1 });

export type MaterialPlanDocument = InferSchemaType<typeof materialPlanSchema>;
export const MaterialPlan = model<MaterialPlanDocument>(
  "MaterialPlan",
  materialPlanSchema,
);

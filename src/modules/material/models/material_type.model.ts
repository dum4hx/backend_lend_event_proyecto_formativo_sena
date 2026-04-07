import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

// Zod schema for API validation
export const MaterialModelZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de organización no válido",
  }),
  categoryId: z
    .array(
      z.string().refine((val) => Types.ObjectId.isValid(val), {
        message: "Formato de ID de categoría no válido",
      }),
    )
    .default([]),
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
  pricePerDay: z.number().positive("El precio debe ser mayor que 0"),
  /**
   * Attribute values assigned to this material type.
   * Each entry references a MaterialAttribute, provides the value, and specifies whether
   * the attribute is required for this material type.
   */
  attributes: z
    .array(
      z.object({
        attributeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
          message: "Formato de ID de atributo no válido",
        }),
        value: z
          .string()
          .min(1, "El valor del atributo no puede estar vacío")
          .max(500, "Máximo 500 caracteres"),
        isRequired: z.boolean().default(false),
      }),
    )
    .default([]),
});

export type MaterialModelInput = z.infer<typeof MaterialModelZodSchema>;

// Material Model mongoose schema
const materialTypeSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    categoryId: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true,
      },
    ],
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
    pricePerDay: {
      type: Number,
      required: true,
      min: 0,
    },
    /**
     * Attribute values applied to this material type.
     * Each attribute can be marked as required or optional for this specific material type.
     * Validated against MaterialAttribute rules at the service layer.
     */
    attributes: {
      type: [
        new Schema(
          {
            attributeId: {
              type: Schema.Types.ObjectId,
              ref: "MaterialAttribute",
              required: true,
            },
            value: {
              type: String,
              required: true,
              maxlength: 500,
              trim: true,
            },
            isRequired: {
              type: Boolean,
              default: false,
            },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

// Index for better query performance
materialTypeSchema.index({ categoryId: 1 });

// Ensure material model names are unique within an organization
materialTypeSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export type MaterialModelDocument = InferSchemaType<typeof materialTypeSchema>;
export const MaterialModel = model<MaterialModelDocument>(
  "MaterialType",
  materialTypeSchema,
);

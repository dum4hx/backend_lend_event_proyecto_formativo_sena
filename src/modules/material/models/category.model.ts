import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

// Zod schema for API validation
export const CategoryZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de organización no válido",
  }),
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "Máximo 100 caracteres")
    .trim(),
  description: z
    .string()
    .min(1, "La descripción es requerida")
    .max(500, "Máximo 500 caracteres")
    .trim(),
  /**
   * Attributes that belong to this category.
   * Each material type in this category should use these attributes.
   * Allows individual material types to mark them as required or optional.
   */
  attributes: z
    .array(
      z.object({
        attributeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
          message: "Formato de ID de atributo no válido",
        }),
        isRequired: z.boolean().default(false),
      }),
    )
    .default([]),
});

export type CategoryInput = z.infer<typeof CategoryZodSchema>;

// Category mongoose schema
const categorySchema = new Schema(
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
      maxlength: 100,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 500,
      trim: true,
    },
    /**
     * Attributes that belong to this category.
     * Material types in this category inherit these attributes.
     * Each entry contains attributeId and a default isRequired flag.
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

// Compound unique index: category name must be unique within an organization
categorySchema.index({ organizationId: 1, name: 1 }, { unique: true });

export type CategoryDocument = InferSchemaType<typeof categorySchema>;
export const Category = model<CategoryDocument>("Category", categorySchema);

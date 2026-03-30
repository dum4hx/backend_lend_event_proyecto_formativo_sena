import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

// Zod schema for API validation
export const MaterialModelZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
  categoryId: z
    .array(
      z.string().refine((val) => Types.ObjectId.isValid(val), {
        message: "Invalid Category ID format",
      }),
    )
    .default([]),
  name: z
    .string()
    .min(1, "Name is required")
    .max(150, "Maximum 150 characters")
    .trim(),
  description: z
    .string()
    .min(1, "Description is required")
    .max(500, "Maximum 500 characters")
    .trim(),
  pricePerDay: z.number().positive("Price must be greater than 0"),
  /**
   * Attribute values assigned to this material type.
   * Each entry references a MaterialAttribute, provides the value, and specifies whether
   * the attribute is required for this material type.
   */
  attributes: z
    .array(
      z.object({
        attributeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
          message: "Invalid Attribute ID format",
        }),
        value: z
          .string()
          .min(1, "Attribute value cannot be empty")
          .max(500, "Maximum 500 characters"),
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

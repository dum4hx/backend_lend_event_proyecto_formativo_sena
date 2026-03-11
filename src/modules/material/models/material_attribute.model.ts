import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

// Zod schema for API validation (organizationId is injected server-side, not from client)
export const MaterialAttributeZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
  categoryId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Invalid Category ID format",
    })
    .optional(),
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Maximum 100 characters")
    .trim(),
  unit: z
    .string()
    .min(1, "Unit is required")
    .max(50, "Maximum 50 characters")
    .trim(),
  allowedValues: z
    .array(
      z
        .string()
        .min(1, "Allowed value cannot be empty")
        .max(200, "Maximum 200 characters"),
    )
    .default([]),
  isRequired: z.boolean().default(false),
});

export type MaterialAttributeInput = z.infer<typeof MaterialAttributeZodSchema>;

// Mongoose schema
const materialAttributeSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    /**
     * If set, this attribute only applies to material types that belong to this category.
     * When null/undefined the attribute is available to all material types in the organization.
     */
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: false,
      default: null,
    },
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    unit: {
      type: String,
      required: true,
      maxlength: 50,
      trim: true,
    },
    /**
     * If non-empty, the value assigned to this attribute on a material type must be one of these strings.
     * If empty, any value is accepted (free-form).
     */
    allowedValues: {
      type: [String],
      default: [],
    },
    /**
     * When true, every in-scope material type (org-wide or restricted by categoryId) must carry
     * this attribute. Creation/update of a material type that omits a required attribute will fail.
     */
    isRequired: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Attribute names must be unique within an organization
materialAttributeSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// Index for efficient look-ups scoped to category
materialAttributeSchema.index({ organizationId: 1, categoryId: 1 });

export type MaterialAttributeDocument = InferSchemaType<
  typeof materialAttributeSchema
>;
export const MaterialAttribute = model<MaterialAttributeDocument>(
  "MaterialAttribute",
  materialAttributeSchema,
);

import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * MaterialAttribute represents a global attribute definition within an organization.
 * It is reusable across categories, but each category defines which attributes it uses
 * via Category.attributes array.
 *
 * The isRequired status is NOT tracked here per-attribute; instead, it is managed:
 * - Per-Category via Category.attributes[].isRequired (category-level default)
 * - Per-MaterialType via MaterialType.attributes[].isRequired (type-level override)
 *
 * This allows the same attribute to be required in Camera category but optional in Lens category,
 * and further overridable per material type.
 */

// Zod schema for API validation (organizationId is injected server-side, not from client)
export const MaterialAttributeZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Maximum 100 characters")
    .trim(),
  unit: z.string().max(50, "Maximum 50 characters").trim().optional(),
  allowedValues: z
    .array(
      z
        .string()
        .min(1, "Allowed value cannot be empty")
        .max(200, "Maximum 200 characters"),
    )
    .default([]),
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
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    unit: {
      type: String,
      required: false,
      default: "",
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

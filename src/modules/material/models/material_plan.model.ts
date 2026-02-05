import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

// Zod schema for API validation
export const MaterialPlanZodSchema = z.object({
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
  materialTypeIds: z
    .array(
      z.string().refine((val) => Types.ObjectId.isValid(val), {
        message: "Invalid Material Model ID format",
      }),
    )
    .min(1, "At least one material model is required"),
  discountRate: z
    .number()
    .min(0, "Discount rate must be non-negative")
    .max(1, "Discount rate must be between 0 and 1"),
});

export type MaterialPlanInput = z.infer<typeof MaterialPlanZodSchema>;

// Material Plan mongoose schema
const materialPlanSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 150,
      trim: true,
      unique: true,
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

// Index for better query performance
materialPlanSchema.index({ materialTypeIds: 1 });

export type MaterialPlanDocument = InferSchemaType<typeof materialPlanSchema>;
export const MaterialPlan = model<MaterialPlanDocument>(
  "MaterialPlan",
  materialPlanSchema,
);

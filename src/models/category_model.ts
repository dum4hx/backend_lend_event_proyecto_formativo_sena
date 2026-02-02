import { z } from "zod";
import { Schema, model, type InferSchemaType } from "mongoose";

// Zod schema for API validation
export const CategoryZodSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Maximum 100 characters")
    .trim(),
  description: z
    .string()
    .min(1, "Description is required")
    .max(500, "Maximum 500 characters")
    .trim(),
});

export type CategoryInput = z.infer<typeof CategoryZodSchema>;

// Category mongoose schema
const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 500,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

export type CategoryDocument = InferSchemaType<typeof categorySchema>;
export const Category = model<CategoryDocument>("Category", categorySchema);

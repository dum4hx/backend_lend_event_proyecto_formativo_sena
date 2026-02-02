import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

// Material instance statuses
const materialStatusOptions: string[] = [
  "available",
  "in_use",
  "maintenance",
  "damaged",
  "retired",
];

// Zod schema for API validation
export const MaterialInstanceZodSchema = z.object({
  modelId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Material Model ID format",
  }),
  serialNumber: z
    .string()
    .min(1, "Serial number is required")
    .max(100, "Maximum 100 characters")
    .trim(),
  status: z
    .enum(["available", "in_use", "maintenance", "damaged", "retired"])
    .default("available"),
  locationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Location ID format",
  }),
});

export type MaterialInstanceInput = z.infer<typeof MaterialInstanceZodSchema>;

// Material Instance mongoose schema
const materialInstanceSchema = new Schema(
  {
    modelId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialModel",
      required: true,
    },
    serialNumber: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
      unique: true,
    },
    status: {
      type: String,
      enum: materialStatusOptions,
      default: "available",
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
materialInstanceSchema.index({ modelId: 1 });
materialInstanceSchema.index({ locationId: 1 });
materialInstanceSchema.index({ status: 1 });
materialInstanceSchema.index({ serialNumber: 1 });

export type MaterialInstanceDocument = InferSchemaType<
  typeof materialInstanceSchema
>;
export const MaterialInstance = model<MaterialInstanceDocument>(
  "MaterialInstance",
  materialInstanceSchema,
);

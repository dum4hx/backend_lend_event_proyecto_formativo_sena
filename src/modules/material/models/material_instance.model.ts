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
// TODO: Consider adding more fields like purchaseDate, warrantyExpiry, etc. in the future
export const MaterialInstanceZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
  modelId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Material Model ID format",
  }),
  serialNumber: z
    .string()
    .min(1, "Serial number is required")
    .max(100, "Maximum 100 characters")
    .trim(),
  notes: z.string().max(500, "Maximum 500 characters").trim().optional(),
  status: z
    .enum(["available", "in_use", "maintenance", "damaged", "retired"])
    .default("available"),
  locationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Location ID format",
  }),
  attributes: z
    .array(
      z.object({
        attributeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
          message: "Invalid Attribute ID format",
        }),
        value: z.string().max(100, "Maximum 100 characters").trim(),
      }),
    )
    .optional(),
  /**
   * Optional flag to ignore capacity warnings
   * If true, allows the operation even if the location is at full capacity
   */
  force: z.boolean().optional().default(false),
});

export type MaterialInstanceInput = z.infer<typeof MaterialInstanceZodSchema>;

// Material Instance mongoose schema
const materialInstanceSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    modelId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialType",
      required: true,
    },
    serialNumber: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    notes: {
      type: String,
      maxlength: 500,
      trim: true,
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
    attributes: [
      {
        attributeId: {
          type: Schema.Types.ObjectId,
          ref: "Attribute",
          required: true,
        },
        value: {
          type: String,
          maxlength: 100,
          trim: true,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
materialInstanceSchema.index({ modelId: 1 });
materialInstanceSchema.index({ locationId: 1 });
materialInstanceSchema.index({ status: 1 });

// Ensure serial numbers are unique within an organization
materialInstanceSchema.index(
  { organizationId: 1, serialNumber: 1 },
  { unique: true },
);

export type MaterialInstanceDocument = InferSchemaType<
  typeof materialInstanceSchema
>;
export const MaterialInstance = model<MaterialInstanceDocument>(
  "MaterialInstance",
  materialInstanceSchema,
);

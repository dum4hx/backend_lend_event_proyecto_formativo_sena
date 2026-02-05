import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Package Status ---------- */

const packageStatusOptions = ["active", "inactive", "discontinued"] as const;

/* ---------- Package Item Schema ---------- */

const packageItemZodSchema = z.object({
  materialTypeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Material Type ID format",
  }),
  quantity: z.number().int().positive("Quantity must be at least 1").default(1),
});

/* ---------- Zod Schema for API Validation ---------- */

export const PackageZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
  name: z.string().min(1, "Name is required").max(150).trim(),
  description: z.string().max(500).trim().optional(),
  items: z.array(packageItemZodSchema).min(1, "At least one item is required"),
  pricePerDay: z.number().positive("Price must be greater than 0"),
  discountRate: z.number().min(0).max(1).default(0),
  depositAmount: z.number().min(0).default(0),
});

export const PackageUpdateZodSchema = PackageZodSchema.partial().omit({
  organizationId: true,
});

export type PackageInput = z.infer<typeof PackageZodSchema>;

/* ---------- Mongoose Sub-Schema ---------- */

const packageItemMongooseSchema = new Schema(
  {
    materialTypeId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialType",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
  },
  { _id: false },
);

/* ---------- Package Mongoose Schema ---------- */

const packageSchema = new Schema(
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
      maxlength: 500,
      trim: true,
    },
    items: {
      type: [packageItemMongooseSchema],
      required: true,
      validate: {
        validator: (v: unknown[]) => v.length > 0,
        message: "Package must have at least one item",
      },
    },
    pricePerDay: {
      type: Number,
      required: true,
      min: 0,
    },
    discountRate: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    depositAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: packageStatusOptions,
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

packageSchema.index({ organizationId: 1, name: 1 }, { unique: true });
packageSchema.index({ organizationId: 1, status: 1 });
packageSchema.index({ "items.materialTypeId": 1 });

/* ---------- Export ---------- */

export type PackageDocument = InferSchemaType<typeof packageSchema>;
export const Package = model<PackageDocument>("Package", packageSchema);

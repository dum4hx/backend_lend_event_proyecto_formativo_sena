import { z } from "zod";
import { Schema, model, type InferSchemaType } from "mongoose";

// Payment method statuses
const paymentStatusOptions: string[] = ["active", "inactive", "deprecated"];

// Zod schema for API validation
export const PaymentMethodZodSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Maximum 100 characters")
    .trim(),
  apiURL: z.url("Must be a valid URL"),
  status: z.enum(["active", "inactive", "deprecated"]).default("active"),
});

export type PaymentMethodInput = z.infer<typeof PaymentMethodZodSchema>;

// Payment Method mongoose schema
const paymentMethodSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
      unique: true,
    },
    apiURL: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^https?:\/\/.+/.test(v),
        message: "Must be a valid URL",
      },
    },
    status: {
      type: String,
      enum: paymentStatusOptions,
      default: "active",
    },
    partneredAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

export type PaymentMethodDocument = InferSchemaType<typeof paymentMethodSchema>;
export const PaymentMethod = model<PaymentMethodDocument>(
  "PaymentMethod",
  paymentMethodSchema,
);

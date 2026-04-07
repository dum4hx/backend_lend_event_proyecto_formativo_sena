import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

// Payment method statuses
export const paymentMethodStatusOptions = ["active", "inactive"] as const;

// Zod schema for API validation (create / update)
export const PaymentMethodZodSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "Máximo 100 caracteres")
    .trim(),
  description: z.string().max(300).trim().optional(),
  status: z.enum(paymentMethodStatusOptions).default("active"),
});

export type PaymentMethodInput = z.infer<typeof PaymentMethodZodSchema>;

// Payment Method mongoose schema
const paymentMethodSchema = new Schema(
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
      maxlength: 300,
      trim: true,
    },
    status: {
      type: String,
      enum: paymentMethodStatusOptions,
      default: "active",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Unique name per organization
paymentMethodSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export type PaymentMethodDocument = InferSchemaType<typeof paymentMethodSchema>;
export const PaymentMethod = model<PaymentMethodDocument>(
  "PaymentMethod",
  paymentMethodSchema,
);

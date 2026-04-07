import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * ============================================================================
 * TRANSFER REJECTION REASON MODEL
 * ============================================================================
 *
 * Org-scoped catalogue of reasons used when denying a transfer request.
 * Default entries are seeded at organization registration and cannot be deleted.
 */

export const TransferRejectionReasonZodSchema = z.object({
  label: z
    .string({ message: "La etiqueta es requerida" })
    .min(3, "La etiqueta debe tener al menos 3 caracteres")
    .max(120, "La etiqueta debe tener como máximo 120 caracteres")
    .trim(),
  isActive: z.boolean().default(true),
});

export type TransferRejectionReasonInput = z.infer<
  typeof TransferRejectionReasonZodSchema
>;

const transferRejectionReasonSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
      maxlength: 120,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
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

transferRejectionReasonSchema.index(
  { organizationId: 1, label: 1 },
  { unique: true },
);

export type TransferRejectionReasonDocument = InferSchemaType<
  typeof transferRejectionReasonSchema
>;
export const TransferRejectionReason = model<TransferRejectionReasonDocument>(
  "TransferRejectionReason",
  transferRejectionReasonSchema,
);

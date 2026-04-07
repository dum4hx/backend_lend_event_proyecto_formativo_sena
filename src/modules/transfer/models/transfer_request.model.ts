import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * ============================================================================
 * TRANSFER REQUEST MODEL
 * ============================================================================
 *
 * Represents a formal request to move material instances between locations.
 * This happens BEFORE the actual physical shipment (Transfer).
 * Request is model-level (material type + quantity), not instance-level.
 */

export const TransferRequestStatusEnum = z.enum([
  "requested",
  "approved",
  "rejected",
  "fulfilled",
  "cancelled",
]);

export type TransferRequestStatus = z.infer<typeof TransferRequestStatusEnum>;

export const TransferRequestZodSchema = z.object({
  fromLocationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de ubicación de origen no válido",
  }),
  toLocationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de ubicación de destino no válido",
  }),
  items: z
    .array(
      z.object({
        modelId: z.string().refine((val) => Types.ObjectId.isValid(val), {
          message: "Formato de ID de modelo no válido",
        }),
        quantity: z.number().int().min(1, "La cantidad debe ser al menos 1"),
        fulfilledQuantity: z.number().int().default(0),
      }),
    )
    .min(1, "Se debe solicitar al menos un elemento"),
  notes: z.string().max(500, "Máximo 500 caracteres").trim().optional(),
  neededBy: z
    .string()
    .datetime({ message: "neededBy debe ser una fecha ISO válida" })
    .optional(),
});

export type TransferRequestInput = z.infer<typeof TransferRequestZodSchema>;

const transferRequestSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    fromLocationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    toLocationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    status: {
      type: String,
      enum: ["requested", "approved", "rejected", "fulfilled", "cancelled"],
      default: "requested",
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    respondedAt: {
      type: Date,
    },
    items: [
      {
        modelId: {
          type: Schema.Types.ObjectId,
          ref: "MaterialType",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        fulfilledQuantity: {
          type: Number,
          required: true,
          default: 0,
        },
      },
    ],
    notes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    neededBy: {
      type: Date,
    },
    rejectionReasonId: {
      type: Schema.Types.ObjectId,
      ref: "TransferRejectionReason",
    },
    rejectionNote: {
      type: String,
      maxlength: 500,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

export type TransferRequestDocument = InferSchemaType<
  typeof transferRequestSchema
>;
export const TransferRequest = model<TransferRequestDocument>(
  "TransferRequest",
  transferRequestSchema,
);

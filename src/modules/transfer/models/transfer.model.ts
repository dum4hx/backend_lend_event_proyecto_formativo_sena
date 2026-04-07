import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * ============================================================================
 * TRANSFER MODEL
 * ============================================================================
 *
 * Represents the physical movement of material instances between locations.
 */

export const ItemConditionEnum = z.enum([
  "OK",
  "DAMAGED",
  "MISSING_PARTS",
  "DIRTY",
  "REPAIR_REQUIRED",
  "LOST",
]);

export type ItemCondition = z.infer<typeof ItemConditionEnum>;

export const TransferStatusEnum = z.enum([
  "picking",
  "in_transit",
  "received",
  "issue_reported",
]);

export type TransferStatus = z.infer<typeof TransferStatusEnum>;

export const TransferZodSchema = z.object({
  requestId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Formato de ID de solicitud no válido",
    })
    .optional(),
  fromLocationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de ubicación de origen no válido",
  }),
  toLocationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de ubicación de destino no válido",
  }),
  items: z
    .array(
      z.object({
        instanceId: z.string().refine((val) => Types.ObjectId.isValid(val), {
          message: "Formato de ID de instancia no válido",
        }),
        sentCondition: ItemConditionEnum.optional(),
        receivedCondition: ItemConditionEnum.optional(),
        notes: z.string().max(200, "Máximo 200 caracteres").trim().optional(),
      }),
    )
    .min(1, "Se debe transferir al menos un elemento"),
  senderNotes: z.string().max(500, "Máximo 500 caracteres").trim().optional(),
  receiverNotes: z.string().max(500, "Máximo 500 caracteres").trim().optional(),
  status: TransferStatusEnum.default("in_transit"),
});

export type TransferInput = z.infer<typeof TransferZodSchema>;

const transferSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    requestId: {
      type: Schema.Types.ObjectId,
      ref: "TransferRequest",
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
    items: [
      {
        instanceId: {
          type: Schema.Types.ObjectId,
          ref: "MaterialInstance",
          required: true,
        },
        sentCondition: {
          type: String,
          enum: ItemConditionEnum.options,
        },
        receivedCondition: {
          type: String,
          enum: ItemConditionEnum.options,
        },
        notes: {
          type: String,
          maxlength: 200,
          trim: true,
        },
      },
    ],
    senderNotes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    receiverNotes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    status: {
      type: String,
      enum: ["picking", "in_transit", "received", "issue_reported"],
      default: "in_transit",
      index: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    receivedAt: {
      type: Date,
    },
    pickedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receivedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

export type TransferDocument = InferSchemaType<typeof transferSchema>;
export const Transfer = model<TransferDocument>("Transfer", transferSchema);

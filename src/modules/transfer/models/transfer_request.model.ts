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
]);

export type TransferRequestStatus = z.infer<typeof TransferRequestStatusEnum>;

export const TransferRequestZodSchema = z.object({
  fromLocationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid From Location ID format",
  }),
  toLocationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid To Location ID format",
  }),
  items: z
    .array(
      z.object({
        modelId: z.string().refine((val) => Types.ObjectId.isValid(val), {
          message: "Invalid Model ID format",
        }),
        quantity: z.number().int().min(1, "Quantity must be at least 1"),
        fulfilledQuantity: z.number().int().default(0),
      }),
    )
    .min(1, "At least one item must be requested"),
  notes: z.string().max(500, "Maximum 500 characters").trim().optional(),
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
      enum: ["requested", "approved", "rejected", "fulfilled"],
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

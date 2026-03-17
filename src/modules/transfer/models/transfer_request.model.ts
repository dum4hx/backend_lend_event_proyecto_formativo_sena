import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/**
 * ============================================================================
 * TRANSFER REQUEST MODEL
 * ============================================================================
 *
 * Represents a formal request to move material instances between locations.
 * This happens BEFORE the actual physical shipment (Transfer).
 */

export const TransferRequestStatusEnum = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "fulfilled", // When the Transfer is actually created/completed
]);

export type TransferRequestStatus = z.infer<typeof TransferRequestStatusEnum>;

export const TransferRequestZodSchema = z.object({
  fromLocationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid From Location ID format",
  }),
  toLocationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid To Location ID format",
  }),
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
      enum: ["pending", "approved", "rejected", "cancelled", "fulfilled"],
      default: "pending",
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    respondedAt: {
      type: Date,
    },
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

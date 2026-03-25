import { Schema, model, type InferSchemaType } from "mongoose";

const movementSourceOptions = ["manual", "scanner", "system"] as const;

const inventoryMovementSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    materialInstanceId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialInstance",
      required: true,
      index: true,
    },
    movementType: {
      type: String,
      enum: ["status_change"],
      required: true,
    },
    previousStatus: {
      type: String,
      required: true,
    },
    newStatus: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: movementSourceOptions,
      default: "manual",
    },
    notes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

export type InventoryMovementDocument = InferSchemaType<
  typeof inventoryMovementSchema
>;

export const InventoryMovement = model<InventoryMovementDocument>(
  "InventoryMovement",
  inventoryMovementSchema,
);

import { Schema, model, type InferSchemaType } from "mongoose";

/* ---------- Ticket Enums ---------- */

export const ticketTypeOptions = [
  "transfer_request",
  "incident_report",
  "maintenance_request",
  "inspection_request",
  "generic",
] as const;
export type TicketType = (typeof ticketTypeOptions)[number];

export const ticketStatusOptions = [
  "pending",
  "in_review",
  "approved",
  "rejected",
  "cancelled",
  "expired",
] as const;
export type TicketStatus = (typeof ticketStatusOptions)[number];

/* ---------- Mongoose Schema ---------- */

const ticketSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    type: {
      type: String,
      enum: ticketTypeOptions,
      required: true,
    },
    status: {
      type: String,
      enum: ticketStatusOptions,
      default: "pending" as const,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 2000,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
    responseDeadline: {
      type: Date,
    },
    resolutionNote: {
      type: String,
      maxlength: 1000,
      trim: true,
    },
    payload: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

ticketSchema.index({ organizationId: 1, locationId: 1, status: 1 });
ticketSchema.index({ organizationId: 1, createdBy: 1 });
ticketSchema.index({ organizationId: 1, assigneeId: 1 }, { sparse: true });
ticketSchema.index({ organizationId: 1, type: 1 });
ticketSchema.index({ responseDeadline: 1 }, { sparse: true });

/* ---------- Export ---------- */

export type TicketDocument = InferSchemaType<typeof ticketSchema>;
export const Ticket = model("Ticket", ticketSchema);

import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Billing Event Types ---------- */

export const billingEventTypeOptions = [
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "payment_succeeded",
  "payment_failed",
  "invoice_paid",
  "invoice_payment_failed",
  "seat_added",
  "seat_removed",
  "plan_upgraded",
  "plan_downgraded",
] as const;

export type BillingEventType = (typeof billingEventTypeOptions)[number];

/* ---------- Billing Event Schema (Audit Log) ---------- */

const billingEventSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    eventType: {
      type: String,
      enum: billingEventTypeOptions,
      required: true,
    },
    stripeEventId: {
      type: String,
      unique: true,
      sparse: true,
    },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    stripePaymentIntentId: String,
    stripeInvoiceId: String,
    // Event data
    amount: Number,
    currency: {
      type: String,
      default: "usd",
    },
    previousPlan: String,
    newPlan: String,
    seatChange: Number,
    // Metadata
    metadata: {
      type: Schema.Types.Mixed,
    },
    // Processing
    processed: {
      type: Boolean,
      default: false,
    },
    processedAt: Date,
    error: String,
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

billingEventSchema.index({ organizationId: 1, createdAt: -1 });
billingEventSchema.index({ processed: 1, createdAt: 1 });

/* ---------- Export ---------- */

export type BillingEventDocument = InferSchemaType<typeof billingEventSchema>;
export const BillingEvent = model<BillingEventDocument>(
  "BillingEvent",
  billingEventSchema,
);

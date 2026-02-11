import { z } from "zod";
import { Schema, model, type InferSchemaType } from "mongoose";

/* ---------- Billing Model Options ---------- */

export const billingModelOptions = ["fixed", "dynamic"] as const;
export type BillingModel = (typeof billingModelOptions)[number];

/* ---------- Subscription Type Status ---------- */

export const subscriptionTypeStatusOptions = [
  "active",
  "inactive",
  "deprecated",
] as const;
export type SubscriptionTypeStatus =
  (typeof subscriptionTypeStatusOptions)[number];

/* ---------- Zod Schemas for API Validation ---------- */

export const SubscriptionTypeZodSchema = z.object({
  plan: z
    .string()
    .min(1, "Plan name is required")
    .max(50)
    .trim()
    .toLowerCase()
    .refine((val) => /^[a-z0-9_]+$/.test(val), {
      message: "Plan name must be alphanumeric with underscores only",
    }),
  displayName: z.string().min(1, "Display name is required").max(100).trim(),
  description: z.string().max(500).trim().optional(),
  billingModel: z.enum(billingModelOptions),
  baseCost: z
    .number()
    .int("Base cost must be in cents (integer)")
    .min(0, "Base cost cannot be negative"),
  pricePerSeat: z
    .number()
    .int("Price per seat must be in cents (integer)")
    .min(0, "Price per seat cannot be negative"),
  maxSeats: z.number().int().min(-1).default(-1), // -1 = unlimited
  maxCatalogItems: z.number().int().min(-1).default(-1), // -1 = unlimited
  features: z.array(z.string()).optional(),
  sortOrder: z.number().int().min(0).default(0),
  stripePriceIdBase: z.string().optional(),
  stripePriceIdSeat: z.string().optional(),
  status: z.enum(subscriptionTypeStatusOptions).default("active"),
});

export const SubscriptionTypeUpdateZodSchema =
  SubscriptionTypeZodSchema.partial().omit({ plan: true });

export type SubscriptionTypeInput = z.infer<typeof SubscriptionTypeZodSchema>;

/* ---------- Mongoose Schema ---------- */

const subscriptionTypeSchema = new Schema(
  {
    // Unique plan identifier (e.g., "free", "starter", "professional")
    plan: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 50,
    },
    // Human-readable name
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    // Optional description
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    // Billing model: fixed seats or dynamic (pay per seat)
    billingModel: {
      type: String,
      enum: billingModelOptions,
      required: true,
    },
    // Base monthly cost in cents
    baseCost: {
      type: Number,
      required: true,
      min: 0,
    },
    // Price per additional seat in cents (used when billingModel is "dynamic")
    pricePerSeat: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    // Maximum seats allowed (-1 = unlimited, used when billingModel is "fixed")
    maxSeats: {
      type: Number,
      min: -1,
      default: -1,
    },
    // Maximum catalog items allowed (-1 = unlimited)
    maxCatalogItems: {
      type: Number,
      min: -1,
      default: -1,
    },
    // Feature flags/list for the plan
    features: {
      type: [String],
      default: [],
    },
    // Sort order for display purposes
    sortOrder: {
      type: Number,
      default: 0,
    },
    // Stripe Price IDs for integration
    stripePriceIdBase: {
      type: String,
      sparse: true,
    },
    stripePriceIdSeat: {
      type: String,
      sparse: true,
    },
    // Status of the subscription type
    status: {
      type: String,
      enum: subscriptionTypeStatusOptions,
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

subscriptionTypeSchema.index({ status: 1, sortOrder: 1 });
subscriptionTypeSchema.index({ plan: 1 }, { unique: true });

/* ---------- Static Methods ---------- */

subscriptionTypeSchema.statics.findByPlan = function (plan: string) {
  return this.findOne({ plan: plan.toLowerCase() });
};

subscriptionTypeSchema.statics.findActiveTypes = function () {
  return this.find({ status: "active" }).sort({ sortOrder: 1 });
};

/* ---------- Export ---------- */

export type SubscriptionTypeDocument = InferSchemaType<
  typeof subscriptionTypeSchema
>;

export const SubscriptionType = model<SubscriptionTypeDocument>(
  "SubscriptionType",
  subscriptionTypeSchema,
);

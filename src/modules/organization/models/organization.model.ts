import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Subscription Plans ---------- */

export const subscriptionPlanOptions = [
  "free",
  "starter",
  "professional",
  "enterprise",
] as const;

export type SubscriptionPlan = (typeof subscriptionPlanOptions)[number];

// Plan limits configuration
export const planLimits: Record<
  SubscriptionPlan,
  {
    maxCatalogItems: number;
    maxSeats: number;
    basePriceMonthly: number;
    pricePerSeat: number;
  }
> = {
  free: {
    maxCatalogItems: 10,
    maxSeats: 1,
    basePriceMonthly: 0,
    pricePerSeat: 0,
  },
  starter: {
    maxCatalogItems: 100,
    maxSeats: 5,
    basePriceMonthly: 2900,
    pricePerSeat: 500,
  },
  professional: {
    maxCatalogItems: 500,
    maxSeats: 20,
    basePriceMonthly: 9900,
    pricePerSeat: 400,
  },
  enterprise: {
    maxCatalogItems: -1,
    maxSeats: -1,
    basePriceMonthly: 29900,
    pricePerSeat: 300,
  }, // -1 = unlimited
};

/* ---------- Organization Status ---------- */

const organizationStatusOptions = ["active", "suspended", "cancelled"] as const;

/* ---------- Zod Schema for API Validation ---------- */

const addressSchema = z.object({
  country: z.string().min(1).max(50).trim(),
  city: z.string().min(1).max(100).trim(),
  street: z.string().min(1).max(200).trim(),
  postalCode: z.string().max(20).trim().optional(),
});

export const OrganizationZodSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(200).trim(),
  legalName: z.string().min(1, "Legal name is required").max(200).trim(),
  taxId: z.string().min(1).max(50).trim().optional(),
  email: z.email("Invalid email format").lowercase().trim(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format (E.164)")
    .optional(),
  address: addressSchema.optional(),
  ownerId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Owner ID format",
  }),
});

export const OrganizationUpdateZodSchema = OrganizationZodSchema.partial().omit(
  {
    ownerId: true,
  },
);

export type OrganizationInput = z.infer<typeof OrganizationZodSchema>;

/* ---------- Mongoose Address Sub-Schema ---------- */

const organizationAddressSchema = new Schema(
  {
    country: { type: String, maxlength: 50, trim: true },
    city: { type: String, maxlength: 100, trim: true },
    street: { type: String, maxlength: 200, trim: true },
    postalCode: { type: String, maxlength: 20, trim: true },
  },
  { _id: false },
);

/* ---------- Subscription Sub-Schema ---------- */

const subscriptionSchema = new Schema(
  {
    plan: {
      type: String,
      enum: subscriptionPlanOptions,
      default: "free",
    },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    seatCount: { type: Number, default: 1, min: 1 },
    catalogItemCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

/* ---------- Organization Mongoose Schema ---------- */

const organizationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 200,
      trim: true,
    },
    legalName: {
      type: String,
      required: true,
      maxlength: 200,
      trim: true,
    },
    taxId: {
      type: String,
      maxlength: 50,
      trim: true,
      sparse: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    address: organizationAddressSchema,
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: organizationStatusOptions,
      default: "active",
    },
    subscription: {
      type: subscriptionSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

organizationSchema.index({ ownerId: 1 });
organizationSchema.index({ email: 1 }, { unique: true });
organizationSchema.index(
  { "subscription.stripeCustomerId": 1 },
  { sparse: true },
);
organizationSchema.index({ status: 1 });

/* ---------- Export ---------- */

export type OrganizationDocument = InferSchemaType<typeof organizationSchema>;
export const Organization = model<OrganizationDocument>(
  "Organization",
  organizationSchema,
);

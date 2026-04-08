import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { Role } from "../../roles/models/role.model.ts";
import {
  AddressZodSchema,
  addressMongooseSchema,
} from "../../shared/address.schema.ts";

/* ---------- Subscription Plans ---------- */

// Default plan options for validation (actual plans are dynamic from SubscriptionType)
export const defaultSubscriptionPlanOptions = [
  "free",
  "starter",
  "professional",
  "enterprise",
] as const;

// SubscriptionPlan is now a string since plans are dynamically defined
export type SubscriptionPlan = string;

/* ---------- Organization Status ---------- */

const organizationStatusOptions = ["active", "suspended", "cancelled"] as const;

/* ---------- Zod Schema for API Validation ---------- */

export const OrganizationZodSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre de la organización es requerido")
    .max(200)
    .trim(),
  legalName: z.string().min(1, "El nombre legal es requerido").max(200).trim(),
  taxId: z.string().min(1).max(50).trim().optional(),
  email: z.email("Formato de correo electrónico no válido").lowercase().trim(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Formato de telefono invalido (E.164)")
    .optional(),
  address: AddressZodSchema.optional(),
  ownerId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de propietario no válido",
  }),
});

export const OrganizationUpdateZodSchema = OrganizationZodSchema.partial().omit(
  {
    ownerId: true,
  },
);

export type OrganizationInput = z.infer<typeof OrganizationZodSchema>;

/* ---------- Settings Zod Schema ---------- */

export const OrganizationSettingsZodSchema = z.object({
  damageDueDays: z
    .number()
    .int()
    .min(1, "Mínimo 1 día")
    .max(365, "Máximo 365 días")
    .optional(),
  requireFullPaymentBeforeCheckout: z.boolean().optional(),
});

export type OrganizationSettingsInput = z.infer<
  typeof OrganizationSettingsZodSchema
>;

/* ---------- Settings Sub-Schema ---------- */

const settingsSchema = new Schema(
  {
    damageDueDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365,
    },
    requireFullPaymentBeforeCheckout: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

/* ---------- Subscription Sub-Schema ---------- */

const subscriptionSchema = new Schema(
  {
    // Plan identifier - references SubscriptionType.plan
    plan: {
      type: String,
      default: "free",
      lowercase: true,
      trim: true,
    },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    seatCount: { type: Number, default: 1, min: 1 },
    catalogItemCount: { type: Number, default: 0, min: 0 },
    // Snapshot of plan limits captured at subscription time.
    // Used as fallback when the SubscriptionType record is deleted or disabled.
    maxSeats: { type: Number, default: -1 },
    maxCatalogItems: { type: Number, default: -1 },
    // Pending plan change fields (used for deferred downgrades via Stripe Subscription Schedules)
    pendingPlan: { type: String, default: null },
    pendingPlanEffectiveDate: { type: Date, default: null },
    stripeScheduleId: { type: String, default: null },
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
      unique: true,
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
    address: addressMongooseSchema,
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
    settings: {
      type: settingsSchema,
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

/* ---------- Document Methods ---------- */

organizationSchema.methods.getOrgRoles = async function (): Promise<
  { _id: Types.ObjectId; name: string }[]
> {
  return Role.find({ organizationId: this._id }, { _id: 1, name: 1 });
};

/* ---------- Export ---------- */

export type OrganizationDocument = InferSchemaType<
  typeof organizationSchema
> & {
  getOrgRoles: () => Promise<{ _id: Types.ObjectId; name: string }[]>;
};

export const Organization = model<OrganizationDocument>(
  "Organization",
  organizationSchema,
);

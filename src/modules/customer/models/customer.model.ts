import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Customer Status ---------- */

const customerStatusOptions = ["active", "inactive", "blacklisted"] as const;

/* ---------- Zod Schema for API Validation ---------- */

const customerNameSchema = z.object({
  firstName: z.string().min(1).max(50).trim(),
  secondName: z.string().max(50).trim().optional().or(z.literal("")),
  firstSurname: z.string().min(1).max(50).trim(),
  secondSurname: z.string().max(50).trim().optional().or(z.literal("")),
});

const customerAddressSchema = z.object({
  country: z.string().min(1).max(50).trim(),
  city: z.string().min(1).max(100).trim(),
  street: z.string().min(1).max(200).trim(),
  postalCode: z.string().max(20).trim().optional(),
  additionalInfo: z.string().max(300).trim().optional(),
});

export const CustomerZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
  name: customerNameSchema,
  email: z.email("Invalid email format").lowercase().trim(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format (E.164)"),
  documentType: z.enum(["cc", "ce", "passport", "nit", "other"]).optional(),
  documentNumber: z.string().max(50).trim().optional(),
  address: customerAddressSchema.optional(),
  notes: z.string().max(1000).trim().optional(),
});

export const CustomerUpdateZodSchema = CustomerZodSchema.partial().omit({
  organizationId: true,
});

export type CustomerInput = z.infer<typeof CustomerZodSchema>;

/* ---------- Mongoose Sub-Schemas ---------- */

const customerNameMongooseSchema = new Schema(
  {
    firstName: { type: String, required: true, maxlength: 50, trim: true },
    secondName: { type: String, maxlength: 50, trim: true },
    firstSurname: { type: String, required: true, maxlength: 50, trim: true },
    secondSurname: { type: String, maxlength: 50, trim: true },
  },
  { _id: false },
);

const customerAddressMongooseSchema = new Schema(
  {
    country: { type: String, maxlength: 50, trim: true },
    city: { type: String, maxlength: 100, trim: true },
    street: { type: String, maxlength: 200, trim: true },
    postalCode: { type: String, maxlength: 20, trim: true },
    additionalInfo: { type: String, maxlength: 300, trim: true },
  },
  { _id: false },
);

/* ---------- Customer Mongoose Schema ---------- */

const customerSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: {
      type: customerNameMongooseSchema,
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    documentType: {
      type: String,
      enum: ["cc", "ce", "passport", "nit", "other"],
    },
    documentNumber: {
      type: String,
      maxlength: 50,
      trim: true,
    },
    address: customerAddressMongooseSchema,
    notes: {
      type: String,
      maxlength: 1000,
      trim: true,
    },
    status: {
      type: String,
      enum: customerStatusOptions,
      default: "active",
    },
    totalLoans: {
      type: Number,
      default: 0,
      min: 0,
    },
    activeLoans: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

// Compound unique: email unique per organization
customerSchema.index({ organizationId: 1, email: 1 }, { unique: true });
// Compound index for document lookup
customerSchema.index(
  { organizationId: 1, documentType: 1, documentNumber: 1 },
  { sparse: true },
);
customerSchema.index({ organizationId: 1, status: 1 });
customerSchema.index({ organizationId: 1, "name.firstSurname": 1 });

/* ---------- Export ---------- */

export type CustomerDocument = InferSchemaType<typeof customerSchema>;
export const Customer = model<CustomerDocument>("Customer", customerSchema);

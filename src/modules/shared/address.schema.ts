import { z } from "zod";
import { Schema } from "mongoose";

/**
 * Valid Colombian street type identifiers.
 * Maps to the "Street Type" dropdown in the address form.
 */
export const COLOMBIAN_STREET_TYPES = [
  "Calle",
  "Carrera",
  "Avenida",
  "Avenida Calle",
  "Avenida Carrera",
  "Diagonal",
  "Transversal",
  "Circular",
  "Via",
] as const;

export type ColombianStreetType = (typeof COLOMBIAN_STREET_TYPES)[number];

// ─────────────────────────────────────────────
// Zod Schema (API validation)
// ─────────────────────────────────────────────

/**
 * Reusable Colombian address Zod schema.
 *
 * Shape matches the ADDRESS section of the registration/edit form:
 *   Street Type / Primary Number / Secondary Number /
 *   Complementary Number / Department / City /
 *   Additional Details (optional) / Postal Code (optional)
 *
 * `country` is intentionally omitted from the form — it is always
 * stored as the default "Colombia" at the database level.
 */
export const AddressZodSchema = z.object({
  streetType: z.enum(COLOMBIAN_STREET_TYPES, {
    error: "Invalid street type",
  }),
  primaryNumber: z.string().min(1, "Primary number is required").max(20).trim(),
  secondaryNumber: z
    .string()
    .min(1, "Secondary number is required")
    .max(20)
    .trim(),
  complementaryNumber: z
    .string()
    .min(1, "Complementary number is required")
    .max(20)
    .trim(),
  department: z.string().min(1, "Department is required").max(100).trim(),
  city: z.string().min(1, "City is required").max(100).trim(),
  additionalDetails: z.string().max(300).trim().optional(),
  postalCode: z.string().max(20).trim().optional(),
});

export type AddressInput = z.infer<typeof AddressZodSchema>;

// ─────────────────────────────────────────────
// Mongoose Sub-Schema (database)
// ─────────────────────────────────────────────

/**
 * Reusable Mongoose sub-schema for Colombian addresses.
 * Use with `_id: false` already set — do not generate a subdoc ObjectId.
 */
export const addressMongooseSchema = new Schema(
  {
    streetType: {
      type: String,
      required: true,
      enum: COLOMBIAN_STREET_TYPES,
      trim: true,
    },
    primaryNumber: {
      type: String,
      required: true,
      maxlength: 20,
      trim: true,
    },
    secondaryNumber: {
      type: String,
      required: true,
      maxlength: 20,
      trim: true,
    },
    complementaryNumber: {
      type: String,
      required: true,
      maxlength: 20,
      trim: true,
    },
    department: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    additionalDetails: {
      type: String,
      maxlength: 300,
      trim: true,
    },
    postalCode: {
      type: String,
      maxlength: 20,
      trim: true,
    },
    country: {
      type: String,
      default: "Colombia",
      maxlength: 50,
      trim: true,
    },
  },
  { _id: false },
);

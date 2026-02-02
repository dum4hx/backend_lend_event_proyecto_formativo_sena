import { z } from "zod";
import { Schema, model, type InferSchemaType } from "mongoose";

// Zod schema for API validation
const addressSchema = z.object({
  country: z
    .string()
    .min(1, "Country is required")
    .max(50, "Maximum 50 characters")
    .trim(),
  street: z
    .string()
    .min(1, "Street is required")
    .max(100, "Maximum 100 characters")
    .trim(),
  propertyNumber: z
    .string()
    .min(1, "Property number is required")
    .max(50, "Maximum 50 characters")
    .trim(),
  additionalInfo: z
    .string()
    .max(200, "Maximum 200 characters")
    .trim()
    .optional()
    .or(z.literal("")),
});

export const LocationZodSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Maximum 100 characters")
    .trim(),
  address: addressSchema,
});

export type LocationInput = z.infer<typeof LocationZodSchema>;

// Address sub-schema
const locationAddressSchema = new Schema(
  {
    country: {
      type: String,
      required: true,
      maxlength: 50,
      trim: true,
    },
    street: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    propertyNumber: {
      type: String,
      required: true,
      maxlength: 50,
      trim: true,
    },
    additionalInfo: {
      type: String,
      maxlength: 200,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

// Location mongoose schema
const locationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
      unique: true,
    },
    address: {
      type: locationAddressSchema,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export type LocationDocument = InferSchemaType<typeof locationSchema>;
export const Location = model<LocationDocument>("Location", locationSchema);

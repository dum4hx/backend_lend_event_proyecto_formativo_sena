import { z } from "zod";
import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * ============================================================================
 * LOCATION MODEL
 * ============================================================================
 *
 * This model represents the organization's physical locations such as
 * warehouses, offices, operation points, etc.
 *
 * Features:
 * - Multi-tenancy: Each location belongs to an organization
 * - Validation with Zod for API requests
 * - Validation with Mongoose for database
 * - Unique compound index (organizationId + name) to prevent duplicates
 *
 * Relations:
 * - Referenced by MaterialInstance (physical inventory)
 * - Can be related to user assignments
 * ============================================================================
 */

// ============================================================================
// ZOD SCHEMAS - Input data validation (API)
// ============================================================================

/**
 * Validation schema for location address
 * All fields are required except state and additionalInfo
 */
const addressSchema = z.object({
  country: z
    .string()
    .min(1, "Country is required")
    .max(50, "Maximum 50 characters")
    .trim(),
  state: z
    .string()
    .max(100, "Maximum 100 characters")
    .trim()
    .optional()
    .or(z.literal("")), // Allows empty string or undefined
  city: z
    .string()
    .min(1, "City is required")
    .max(100, "Maximum 100 characters")
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
    .or(z.literal("")), // Allows empty string or undefined
});

/**
 * Main validation schema for Location
 * Used in POST/PATCH endpoints to validate request body
 */
export const LocationZodSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Maximum 100 characters")
    .trim(),
  address: addressSchema,
  isActive: z.boolean().default(true),
});

/**
 * TypeScript type inferred from Zod schema
 * Useful for type-checking in controllers and services
 */
export type LocationInput = z.infer<typeof LocationZodSchema>;

// ============================================================================
// MONGOOSE SCHEMAS - Database structure definition
// ============================================================================

/**
 * Sub-schema for address
 * _id: false prevents Mongoose from generating an ObjectId for each address
 */
const locationAddressSchema = new Schema(
  {
    country: {
      type: String,
      required: true,
      maxlength: 50,
      trim: true,
    },
    state: {
      type: String,
      maxlength: 100,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      maxlength: 100,
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
    _id: false, // Don't generate _id for subdocuments
  },
);

/**
 * Main Location schema in Mongoose
 *
 * Fields:
 * - name: Identifying name of the location
 * - organizationId: Reference to owner organization (multi-tenancy)
 * - address: Embedded object with address data
 *
 * Timestamps:
 * - createdAt: Creation date (automatic)
 * - updatedAt: Last update date (automatic)
 */
const locationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true, // Optimizes queries by organization
    },
    address: {
      type: locationAddressSchema,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  },
);

/**
 * Unique compound index
 * Ensures no two locations with the same name exist
 * within the same organization
 */
locationSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * TypeScript type of Location document in Mongoose
 * Includes all schema fields + _id, createdAt, updatedAt
 */
export type LocationDocument = InferSchemaType<typeof locationSchema>;

/**
 * Mongoose model to interact with "locations" collection
 * Used in services for CRUD operations
 */
export const Location = model<LocationDocument>("Location", locationSchema);

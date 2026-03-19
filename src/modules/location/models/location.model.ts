import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";
import {
  AddressZodSchema,
  addressMongooseSchema,
} from "../../shared/address.schema.ts";

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
 * Location status enum
 * Defines the operational state of a location
 */
export const LocationStatusEnum = z.enum([
  "available",
  "full_capacity",
  "maintenance",
  "inactive",
]);

export type LocationStatus = z.infer<typeof LocationStatusEnum>;

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
  address: AddressZodSchema,
  status: LocationStatusEnum.default("available"),
  /**
   * Capacity mapping for each material type
   * Defines how many of each material type this location can hold
   */
  materialCapacities: z
    .array(
      z.object({
        materialTypeId: z
          .string()
          .refine((val) => Types.ObjectId.isValid(val), {
            message: "Invalid Material Type ID format",
          }),
        maxQuantity: z.number().int().min(0, "Max quantity must be at least 0"),
      }),
    )
    .optional()
    .default([]),
  additionalDetails: z
    .string()
    .max(500, "Maximum 500 characters")
    .trim()
    .optional(),
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
 * Main Location schema in Mongoose
 *
 * Fields:
 * - name: Identifying name of the location
 * - organizationId: Reference to owner organization (multi-tenancy)
 * - address: Embedded object with address data
 * - status: Operational status of the location
 * - additionalDetails: Extra information about the location
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
      type: addressMongooseSchema,
      required: true,
    },
    status: {
      type: String,
      enum: ["available", "full_capacity", "maintenance", "inactive"],
      default: "available",
      index: true,
    },
    /**
     * Capacity mapping for each material type
     * Defines how many of each material type this location can hold
     */
    materialCapacities: {
      type: [
        new Schema(
          {
            materialTypeId: {
              type: Schema.Types.ObjectId,
              ref: "MaterialType",
              required: true,
            },
            maxQuantity: {
              type: Number,
              required: true,
              min: 0,
            },
            currentQuantity: {
              type: Number,
              required: true,
              min: 0,
              default: 0,
            },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    additionalDetails: {
      type: String,
      maxlength: 500,
      trim: true,
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

import { Types } from "mongoose";
import { Location } from "./models/location.model.ts";
import { User } from "../user/models/user.model.ts";
import { authService } from "../auth/auth.service.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { AppError } from "../../errors/AppError.ts";

/**
 * ============================================================================
 * LOCATION SERVICE
 * ============================================================================
 *
 * Business logic layer for the locations module.
 *
 * Responsibilities:
 * - Business rules validation
 * - Database interaction
 * - Entity relationship management
 * - Data-level permission verification
 *
 * Principles:
 * - All methods are static (no instantiation required)
 * - Multi-tenancy: All operations filter by organizationId
 * - Consistent errors using AppError
 * ============================================================================
 */

// ============================================================================
// INTERFACES - Data contracts for type-safety
// ============================================================================

/**
 * Parameters for listing locations with pagination and filters
 */
interface ListLocationsParams {
  organizationId: string; // Organization ID (scope)
  page: number; // Page number (1-indexed)
  limit: number; // Items per page
  search?: string; // Search by name/city/street
  city?: string; // Specific city filter
  status?: "available" | "full_capacity" | "maintenance" | "inactive"; // Status filter
  includeInactive?: boolean; // Whether to include inactive locations
}

/**
 * Required data to create a new location
 */
interface CreateLocationData {
  name: string;
  organizationId: Types.ObjectId | string; // Accepts both types
  userId: string; // ID of the user creating the location
  address: {
    country: string;
    state?: string; // Optional
    city: string;
    street: string;
    propertyNumber: string;
    additionalInfo?: string; // Optional
  };
  status?: "available" | "full_capacity" | "maintenance" | "inactive"; // Optional, defaults to available
  additionalDetails?: string; // Optional extra information about the location
}

/**
 * Data to update an existing location
 * All fields are optional (partial update)
 */
interface UpdateLocationData {
  name?: string;
  address?: {
    country?: string;
    state?: string;
    city?: string;
    street?: string;
    propertyNumber?: string;
    additionalInfo?: string;
  };
  status?: "available" | "full_capacity" | "maintenance" | "inactive";
  additionalDetails?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class LocationService {
  /**
   * Lists locations with pagination and filters
   *
   * @param params - Search and pagination parameters
   * @returns Object with items and pagination metadata
   *
   * Features:
   * - Text search in name, city and street
   * - Specific city filter
   * - Sorting by creation date (newest first)
   * - Automatic organization scope
   */
  static async listLocations(params: ListLocationsParams) {
    const { organizationId, page, limit, search, city, status, includeInactive } =
      params;

    // Calculate offset for pagination
    const skip = (page - 1) * limit;

    // Build query with organization scope
    const query: Record<string, unknown> = { organizationId };

    // Default to active locations only unless includeInactive is true
    if (!includeInactive) {
      query.isActive = true;
    }

    // Apply city filter (case-insensitive)
    if (city) {
      query["address.city"] = { $regex: city, $options: "i" };
    }

    // Apply status filter
    if (status) {
      query.status = status;
    }

    // Apply text search in multiple fields
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { "address.city": { $regex: search, $options: "i" } },
        { "address.street": { $regex: search, $options: "i" } },
      ];
    }

    // Execute data query and count in parallel (optimization)
    const [items, total] = await Promise.all([
      Location.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Location.countDocuments(query),
    ]);

    // Return data with pagination metadata
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Gets a location by its ID
   *
   * @param id - Location ObjectId
   * @param organizationId - Organization ID (scope)
   * @returns Location document
   * @throws AppError.badRequest if ID is invalid
   * @throws AppError.notFound if doesn't exist or doesn't belong to organization
   */
  static async getLocationById(id: string, organizationId: string) {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(id)) {
      throw AppError.badRequest("Invalid location ID format");
    }

    // Search with organization scope (multi-tenant security)
    const location = await Location.findOne({
      _id: id,
      organizationId,
    });

    if (!location) {
      throw AppError.notFound("Location not found");
    }

    return location;
  }

  /**
   * Creates a new location
   *
   * @param data - Location data to create
   * @returns Created location
   * @throws AppError.conflict if a location with that name already exists
   *
   * Validations:
   * - Unique name per organization
   * - All required fields present (validated by Mongoose)
   * - Automatically relates to creator if they are an owner
   */
  static async createLocation(data: CreateLocationData) {
    const { userId, ...locationData } = data;

    // Check for duplicate name in organization
    const existing = await Location.findOne({
      organizationId: locationData.organizationId,
      name: locationData.name,
    });

    if (existing) {
      throw AppError.conflict("A location with this name already exists");
    }

    // Create and return new location
    const location = await Location.create(locationData);

    // If creator is an owner, associate the location with them
    const isOwner = await authService.isOwner(userId);
    if (isOwner) {
      await User.updateOne(
        { _id: userId },
        { $addToSet: { locations: location._id } },
      );
    }

    return location;
  }

  /**
   * Updates an existing location
   *
   * @param id - Location ObjectId
   * @param organizationId - Organization ID (scope)
   * @param data - Fields to update (partial)
   * @returns Updated location
   * @throws AppError.badRequest if ID is invalid
   * @throws AppError.notFound if doesn't exist
   *
   * Features:
   * - Partial update (only sent fields)
   * - Automatic validation by Mongoose (runValidators)
   * - Returns updated document (new: true)
   */
  static async updateLocation(
    id: string,
    organizationId: string,
    data: UpdateLocationData,
  ) {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(id)) {
      throw AppError.badRequest("Invalid location ID format");
    }

    // Update with organization scope
    const location = await Location.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: data },
      { new: true, runValidators: true }, // Return new document + validate
    );

    if (!location) {
      throw AppError.notFound("Location not found");
    }

    return location;
  }

  /**
   * Deactivates a location (soft delete)
   *
   * @param id - Location ObjectId
   * @param organizationId - Organization ID (scope)
   * @returns Confirmation object
   * @throws AppError.badRequest if ID is invalid
   * @throws AppError.notFound if doesn't exist
   * @throws AppError.conflict if assigned to material instances
   *
   * IMPORTANT: This method checks referential integrity before deactivation
   */
  static async deleteLocation(id: string, organizationId: string) {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(id)) {
      throw AppError.badRequest("Invalid location ID format");
    }

    // Check if in use by material instances (referential integrity)
    // We block deactivation if items are still physically at this location
    const inUse = await MaterialInstance.countDocuments({
      organizationId,
      locationId: id,
    });

    if (inUse > 0) {
      throw AppError.conflict(
        "Location cannot be deactivated because it is currently assigned to material instances",
      );
    }

    // Soft delete location with organization scope
    const location = await Location.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: { isActive: false } },
      { new: true },
    );

    if (!location) {
      throw AppError.notFound("Location not found");
    }

    return { success: true };
  }

  /**
   * Reactivates a soft-deleted location
   *
   * @param id - Location ObjectId
   * @param organizationId - Organization ID (scope)
   * @returns Updated location
   */
  static async reactivateLocation(id: string, organizationId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw AppError.badRequest("Invalid location ID format");
    }

    const location = await Location.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: { isActive: true } },
      { new: true },
    );

    if (!location) {
      throw AppError.notFound("Location not found");
    }

    return location;
  }

  /**
   * Checks if a location exists and is active
   *
   * @param id - Location ObjectId
   * @param organizationId - Organization ID (scope)
   * @param activeOnly - Whether to only return true for active locations
   * @returns true if exists (and optionally active), false otherwise
   *
   * Useful for validations in other services
   */
  static async locationExists(
    id: string,
    organizationId: string,
    activeOnly = false,
  ): Promise<boolean> {
    // If ID is invalid, return false directly
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }

    // Build query
    const query: Record<string, unknown> = { _id: id, organizationId };
    if (activeOnly) {
      query.isActive = true;
    }

    // Count documents (more efficient than findOne)
    const count = await Location.countDocuments(query);

    return count > 0;
  }

  /**
   * Gets total locations count for an organization
   *
   * @param organizationId - Organization ID
   * @returns Total number of locations
   *
   * Useful for dashboards and reports
   */
  static async getLocationsCount(organizationId: string): Promise<number> {
    return await Location.countDocuments({ organizationId });
  }
}

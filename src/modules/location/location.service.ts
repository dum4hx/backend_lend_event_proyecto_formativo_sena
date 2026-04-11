import { Types, type ClientSession } from "mongoose";
import { Location } from "./models/location.model.ts";
import { User } from "../user/models/user.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { AppError } from "../../errors/AppError.ts";
import rolesService from "../roles/roles.service.ts";

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
  code: string; // Unique alphanumeric code per organization
  managerId: string;
  organizationId: Types.ObjectId | string; // Accepts both types
  userId: string; // ID of the user creating the location
  address: {
    streetType: string;
    primaryNumber: string;
    secondaryNumber: string;
    complementaryNumber: string;
    department: string;
    city: string;
    additionalDetails?: string;
    postalCode?: string;
  };
  status?: "available" | "full_capacity" | "maintenance" | "inactive"; // Optional, defaults to available
  additionalDetails?: string; // Optional extra information about the location
  materialCapacities?: Array<{
    materialTypeId: string;
    maxQuantity: number;
  }>;
}

/**
 * Data to update an existing location
 * All fields are optional (partial update)
 */
interface UpdateLocationData {
  name?: string;
  code?: string; // Unique alphanumeric code per organization
  managerId?: string;
  address?: {
    streetType?: string;
    primaryNumber?: string;
    secondaryNumber?: string;
    complementaryNumber?: string;
    department?: string;
    city?: string;
    additionalDetails?: string;
    postalCode?: string;
  };
  status?: "available" | "full_capacity" | "maintenance" | "inactive";
  additionalDetails?: string;
  materialCapacities?: Array<{
    materialTypeId: string;
    maxQuantity: number;
  }>;
}

interface ImportLocationRowInput {
  name: string;
  code: string;
  managerId?: string;
  managerEmail?: string;
  address: {
    streetType: string;
    primaryNumber: string;
    secondaryNumber: string;
    complementaryNumber: string;
    department: string;
    city: string;
    additionalDetails?: string;
    postalCode?: string;
  };
  status?: "available" | "full_capacity" | "maintenance" | "inactive";
  additionalDetails?: string;
  materialCapacities?: Array<{
    materialTypeId: string;
    maxQuantity: number;
  }>;
}

interface ImportLocationsData {
  organizationId: Types.ObjectId | string;
  userId: string;
  rows: ImportLocationRowInput[];
}

interface LocationOccupancySnapshot {
  occupied: number;
  byMaterialType: Map<string, number>;
}

/**
 * Valid role names that can be assigned as location managers.
 * Only Manager/Gerente roles can be assigned to a specific location.
 * Owner (Propietario) has global access to all locations but cannot be assigned as a specific location manager.
 */
const MANAGER_ROLE_NAME_VARIANTS = new Set([
  "gerente",
  "gerente de sede",
  "manager",
  "branch manager",
]);

const OWNER_ROLE_NAME_VARIANTS = new Set(["propietario", "owner", "dueño", "dueno"]);

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class LocationService {
  private static async getLocationOccupancySnapshots(params: {
    organizationId: Types.ObjectId | string;
    locationIds: Array<Types.ObjectId | string>;
    session?: ClientSession;
  }): Promise<Map<string, LocationOccupancySnapshot>> {
    const { organizationId, locationIds, session } = params;

    if (locationIds.length === 0) {
      return new Map();
    }

    const organizationObjectId =
      organizationId instanceof Types.ObjectId
        ? organizationId
        : new Types.ObjectId(String(organizationId));

    const locationObjectIds = locationIds.map((locationId) =>
      locationId instanceof Types.ObjectId
        ? locationId
        : new Types.ObjectId(String(locationId)),
    );

    const aggregateQuery = MaterialInstance.aggregate<{
      _id: {
        locationId: Types.ObjectId;
        modelId: Types.ObjectId;
      };
      quantity: number;
    }>([
      {
        $match: {
          organizationId: organizationObjectId,
          locationId: { $in: locationObjectIds },
          status: { $ne: "retired" },
        },
      },
      {
        $group: {
          _id: {
            locationId: "$locationId",
            modelId: "$modelId",
          },
          quantity: { $sum: 1 },
        },
      },
    ]);

    if (session) {
      aggregateQuery.session(session);
    }

    const rows = await aggregateQuery;

    const result = new Map<string, LocationOccupancySnapshot>();
    for (const row of rows) {
      const locationKey = row._id.locationId.toString();
      const modelKey = row._id.modelId.toString();
      const existing =
        result.get(locationKey) ??
        ({ occupied: 0, byMaterialType: new Map<string, number>() } as LocationOccupancySnapshot);

      existing.byMaterialType.set(modelKey, row.quantity);
      existing.occupied += row.quantity;
      result.set(locationKey, existing);
    }

    return result;
  }

  private static applyLiveOccupancyToLocation(
    locationInput: any,
    snapshot?: LocationOccupancySnapshot,
  ) {
    const location = locationInput?.toObject
      ? locationInput.toObject()
      : locationInput;

    const materialCapacities = Array.isArray(location.materialCapacities)
      ? location.materialCapacities.map((entry: any) => {
          const materialTypeKey = String(entry.materialTypeId);
          const liveQuantity =
            snapshot?.byMaterialType.get(materialTypeKey) ?? 0;

          return {
            ...entry,
            currentQuantity: liveQuantity,
          };
        })
      : [];

    const totalCapacity = materialCapacities.reduce(
      (sum: number, entry: any) => sum + (entry.maxQuantity ?? 0),
      0,
    );

    const occupied = snapshot?.occupied ?? 0;
    const occupancyRate =
      totalCapacity > 0
        ? Math.round((occupied / totalCapacity) * 10000) / 100
        : 0;

    return {
      ...location,
      materialCapacities,
      occupied,
      occupancySummary: {
        totalCapacity,
        occupied,
        occupancyRate,
      },
    };
  }

  private static async enrichLocationsWithLiveOccupancy(
    organizationId: Types.ObjectId | string,
    locations: any[],
  ) {
    if (!locations.length) return locations;

    const locationIds = locations.map((location) => String(location._id));
    const snapshots = await this.getLocationOccupancySnapshots({
      organizationId,
      locationIds,
    });

    return locations.map((location) =>
      this.applyLiveOccupancyToLocation(
        location,
        snapshots.get(String(location._id)),
      ),
    );
  }

  private static isValidManagerRoleName(roleName?: string | null): boolean {
    if (!roleName) return false;
    return MANAGER_ROLE_NAME_VARIANTS.has(roleName.trim().toLowerCase());
  }

  private static isOwnerRoleName(roleName?: string | null): boolean {
    if (!roleName) return false;
    return OWNER_ROLE_NAME_VARIANTS.has(roleName.trim().toLowerCase());
  }

  private static async syncUserLocationAssignment(params: {
    userId: string;
    organizationId: Types.ObjectId | string;
    locationId: Types.ObjectId | string;
    roleName?: string | null;
  }): Promise<void> {
    const { userId, organizationId, locationId, roleName } = params;

    if (this.isOwnerRoleName(roleName)) {
      await User.updateOne(
        { _id: userId, organizationId },
        { $addToSet: { locations: locationId } },
      );
      return;
    }

    // Non-owner users can only be associated with one location at a time.
    await User.updateOne(
      { _id: userId, organizationId },
      { $set: { locations: [locationId] } },
    );
  }

  private static async validateManagerAssignment(
    managerId: string,
    organizationId: Types.ObjectId | string,
    options?: { currentLocationId?: string },
  ) {
    if (!Types.ObjectId.isValid(managerId)) {
      throw AppError.badRequest("Formato de ID de gerente no válido");
    }

    const manager = await User.findById(managerId)
      .select("_id organizationId email roleId status name")
      .lean();

    if (!manager) {
      throw AppError.notFound("El gerente asignado no existe", {
        code: "LOCATION_MANAGER_NOT_FOUND",
      });
    }

    if (manager.organizationId.toString() !== organizationId.toString()) {
      throw AppError.conflict(
        "El gerente asignado no pertenece a la misma organización de la sede",
        {
          code: "LOCATION_MANAGER_ORG_MISMATCH",
        },
      );
    }

    const roleName = await rolesService.getRoleName(manager.roleId);
    if (!this.isValidManagerRoleName(roleName)) {
      throw AppError.conflict(
        "El usuario asignado no tiene un rol válido de Gerente de Sede",
        {
          code: "LOCATION_MANAGER_INVALID_ROLE",
          roleName,
        },
      );
    }

    if (manager.status !== "active") {
      throw AppError.conflict("El gerente asignado debe estar activo", {
        code: "LOCATION_MANAGER_INACTIVE",
      });
    }

    const conflictingLocationQuery: Record<string, unknown> = {
      organizationId,
      managerId: manager._id,
    };

    if (options?.currentLocationId) {
      conflictingLocationQuery._id = { $ne: options.currentLocationId };
    }

    const conflictingLocation = await Location.findOne(conflictingLocationQuery)
      .select("_id name code")
      .lean();

    if (conflictingLocation && !this.isOwnerRoleName(roleName)) {
      throw AppError.conflict(
        "El usuario ya está asignado a otra sede. Para roles distintos a Dueño solo se permite una sede activa",
        {
          code: "LOCATION_MANAGER_ALREADY_ASSIGNED",
          conflictingLocation: {
            id: conflictingLocation._id.toString(),
            name: conflictingLocation.name,
            code: conflictingLocation.code,
          },
        },
      );
    }

    return {
      ...manager,
      roleName,
    };
  }

  private static async mapLocationWithManager(location: any) {
    const plain = location?.toObject ? location.toObject() : location;
    const managerSource = plain?.managerId;

    if (!managerSource) {
      return {
        ...plain,
        managerId: null,
        manager: null,
      };
    }

    const managerDoc =
      typeof managerSource === "object" && managerSource?._id
        ? managerSource
        : null;

    if (!managerDoc) {
      return {
        ...plain,
        managerId: managerSource.toString(),
        manager: null,
      };
    }

    const roleName = await rolesService.getRoleName(managerDoc.roleId);
    const manager = {
      _id: managerDoc._id.toString(),
      email: managerDoc.email,
      roleId: managerDoc.roleId,
      roleName,
      name: {
        firstName: managerDoc.name?.firstName ?? "",
        firstSurname: managerDoc.name?.firstSurname ?? "",
      },
      status: managerDoc.status,
    };

    return {
      ...plain,
      managerId: manager._id,
      manager,
    };
  }

  private static getManagerPopulateConfig() {
    return {
      path: "managerId",
      select: "email roleId status name.firstName name.firstSurname",
    };
  }

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
    const {
      organizationId,
      page,
      limit,
      search,
      city,
      status,
      includeInactive,
    } = params;

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
        { "address.department": { $regex: search, $options: "i" } },
      ];
    }

    // Execute data query and count in parallel (optimization)
    const [items, total] = await Promise.all([
      Location.find(query)
        .populate(this.getManagerPopulateConfig())
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Location.countDocuments(query),
    ]);

    const itemsWithManager = await Promise.all(
      items.map((item) => this.mapLocationWithManager(item)),
    );

    const enrichedItems = await this.enrichLocationsWithLiveOccupancy(
      organizationId,
      itemsWithManager,
    );

    // Return data with pagination metadata
    return {
      items: enrichedItems,
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
  static async getLocationById(
    id: string,
    organizationId: string,
    options?: { includeManager?: boolean },
  ) {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(id)) {
      throw AppError.badRequest("Formato de ID de ubicación no válido");
    }

    // Search with organization scope (multi-tenant security)
    const query = Location.findOne({
      _id: id,
      organizationId,
    });

    if (options?.includeManager) {
      query.populate(this.getManagerPopulateConfig());
    }

    const location = await query;

    if (!location) {
      throw AppError.notFound("Ubicación no encontrada");
    }

    const mappedLocation = options?.includeManager
      ? await this.mapLocationWithManager(location)
      : location.toObject();

    const [enriched] = await this.enrichLocationsWithLiveOccupancy(
      organizationId,
      [mappedLocation],
    );

    return enriched;
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
   * - Automatically relates the creator to the location via their locations array
   */
  static async createLocation(data: CreateLocationData) {
    const { userId, ...locationData } = data;

    const validatedManager = await this.validateManagerAssignment(
      locationData.managerId,
      locationData.organizationId,
    );

    // Check for duplicate name in organization
    const existingName = await Location.findOne({
      organizationId: locationData.organizationId,
      name: locationData.name,
    });

    if (existingName) {
      throw AppError.conflict("Ya existe una ubicación con este nombre");
    }

    // Check for duplicate code in organization
    const existingCode = await Location.findOne({
      organizationId: locationData.organizationId,
      code: locationData.code,
    });

    if (existingCode) {
      throw AppError.conflict("Ya existe una ubicación con este código");
    }

    // Create and return new location
    const location = await Location.create(locationData);

    const [creator, managerRoleName] = await Promise.all([
      User.findById(userId).select("_id roleId organizationId").lean(),
      Promise.resolve(validatedManager.roleName),
    ]);

    if (creator && creator.organizationId.toString() === locationData.organizationId.toString()) {
      const creatorRoleName = await rolesService.getRoleName(creator.roleId);
      await this.syncUserLocationAssignment({
        userId,
        organizationId: locationData.organizationId,
        locationId: location._id,
        roleName: creatorRoleName,
      });
    }

    await this.syncUserLocationAssignment({
      userId: locationData.managerId,
      organizationId: locationData.organizationId,
      locationId: location._id,
      roleName: managerRoleName,
    });

    const locationWithManager = await Location.findById(location._id).populate(
      this.getManagerPopulateConfig(),
    );

    return await this.mapLocationWithManager(locationWithManager);
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
      throw AppError.badRequest("Formato de ID de ubicación no válido");
    }

    const existingLocation = await Location.findOne({ _id: id, organizationId });
    if (!existingLocation) {
      throw AppError.notFound("Ubicación no encontrada");
    }

    // Check for duplicate code in organization (exclude current location)
    if (data.code) {
      const existingCode = await Location.findOne({
        organizationId,
        code: data.code,
        _id: { $ne: id },
      });

      if (existingCode) {
        throw AppError.conflict("Ya existe una ubicación con este código");
      }
    }

    const previousManagerId = existingLocation.managerId?.toString();

    const resolvedManagerId =
      data.managerId ?? existingLocation.managerId?.toString();

    if (!resolvedManagerId) {
      throw AppError.conflict(
        "La ubicación no tiene gerente asignado. Debes asignar un gerente válido antes de actualizarla",
        {
          code: "LOCATION_MANAGER_REQUIRED",
        },
      );
    }

    if (
      data.managerId !== undefined ||
      existingLocation.managerId === undefined ||
      existingLocation.managerId === null
    ) {
      await this.validateManagerAssignment(resolvedManagerId, organizationId, {
        currentLocationId: id,
      });
    }

    const resolvedManager = await this.validateManagerAssignment(
      resolvedManagerId,
      organizationId,
      {
        currentLocationId: id,
      },
    );

    // Update with organization scope
    const location = await Location.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: { ...data, managerId: resolvedManagerId } },
      { new: true, runValidators: true }, // Return new document + validate
    ).populate(this.getManagerPopulateConfig());

    if (previousManagerId && previousManagerId !== resolvedManagerId) {
      await User.updateOne(
        { _id: previousManagerId, organizationId },
        { $pull: { locations: id } },
      );
    }

    await this.syncUserLocationAssignment({
      userId: resolvedManagerId,
      organizationId,
      locationId: id,
      roleName: resolvedManager.roleName,
    });

    return await this.mapLocationWithManager(location);
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
      throw AppError.badRequest("Formato de ID de ubicación no válido");
    }

    // Check if in use by material instances (referential integrity)
    // We block deactivation if items are still physically at this location
    const inUse = await MaterialInstance.countDocuments({
      organizationId,
      locationId: id,
    });

    if (inUse > 0) {
      throw AppError.conflict(
        "La ubicación no se puede desactivar porque actualmente está asignada a instancias de material",
      );
    }

    // Soft delete location with organization scope
    const location = await Location.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: { isActive: false } },
      { new: true },
    );

    if (!location) {
      throw AppError.notFound("Ubicación no encontrada");
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
      throw AppError.badRequest("Formato de ID de ubicación no válido");
    }

    const location = await Location.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: { isActive: true } },
      { new: true },
    );

    if (!location) {
      throw AppError.notFound("Ubicación no encontrada");
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

    // Execute count
    const count = await Location.countDocuments(query);
    return count > 0;
  }

  /**
   * Gets the current occupancy of a material type at a location
   *
   * @param locationId - Location ID
   * @param materialTypeId - Material Type ID
   * @returns Current count of material instances at the location
   */
  static async getMaterialOccupancy(
    locationId: string | Types.ObjectId,
    materialTypeId: string | Types.ObjectId,
  ): Promise<number> {
    return await MaterialInstance.countDocuments({
      locationId,
      modelId: materialTypeId,
      status: { $ne: "retired" }, // Only count non-retired instances
    });
  }

  /**
   * Validates if a location has capacity for a material type
   *
   * @param locationId - Location ID
   * @param materialTypeId - Material Type ID
   * @param organizationId - Organization ID
   * @param force - Whether to force the operation even if at full capacity
   * @throws AppError.notFound if location doesn't exist
   * @throws AppError.conflict if capacity reached and force is false (warning)
   */
  static async validateCapacity(
    locationId: string,
    materialTypeId: string,
    organizationId: string,
    force = false,
  ): Promise<void> {
    const location = await this.getLocationById(locationId, organizationId);

    // Find if there's a specific capacity for this material type
    const capacitySetting = location.materialCapacities?.find(
      (c: any) => c.materialTypeId.toString() === materialTypeId.toString(),
    );

    // If no capacity limit is defined, allow everything
    if (!capacitySetting) {
      return;
    }

    const currentOccupancy = await this.getMaterialOccupancy(
      locationId,
      materialTypeId,
    );

    if (currentOccupancy >= capacitySetting.maxQuantity) {
      if (!force) {
        throw AppError.conflict(
          `La ubicación "${location.name}" ha alcanzado su capacidad máxima (${capacitySetting.maxQuantity}) para este tipo de material.`,
          {
            type: "CAPACITY_WARNING",
            currentOccupancy,
            maxQuantity: capacitySetting.maxQuantity,
            message:
              "No se recomienda agregar más ítems a esta ubicación ya que está a máxima capacidad. Confirme si desea continuar de todas formas.",
          },
        );
      }
    }
  }

  static async importLocations(data: ImportLocationsData) {
    const { organizationId, userId, rows } = data;

    const results: Array<{
      row: number;
      status: "created" | "failed";
      locationId?: string;
      error?: { code: string; message: string; details?: unknown };
    }> = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row) {
        continue;
      }
      const rowNumber = index + 1;

      try {
        const managerId =
          row.managerId ??
          (await this.resolveManagerIdByEmail({
            organizationId,
            ...(row.managerEmail ? { managerEmail: row.managerEmail } : {}),
          }));

        if (!managerId) {
          throw AppError.badRequest(
            "Cada fila debe incluir managerId o managerEmail",
            {
              code: "LOCATION_MANAGER_REQUIRED",
            },
          );
        }

        const created = await this.createLocation({
          name: row.name,
          code: row.code,
          managerId,
          organizationId,
          userId,
          address: row.address,
          ...(row.status ? { status: row.status } : {}),
          ...(row.additionalDetails
            ? { additionalDetails: row.additionalDetails }
            : {}),
          ...(row.materialCapacities
            ? { materialCapacities: row.materialCapacities }
            : {}),
        });

        results.push({
          row: rowNumber,
          status: "created",
          locationId: created._id,
        });
      } catch (error) {
        const appError =
          error instanceof AppError
            ? error
            : AppError.internal("No se pudo importar la ubicación", error);

        results.push({
          row: rowNumber,
          status: "failed",
          error: {
            code: appError.code,
            message: appError.message,
            ...(appError.details !== undefined && { details: appError.details }),
          },
        });
      }
    }

    const createdCount = results.filter((r) => r.status === "created").length;
    const failedCount = results.length - createdCount;

    return {
      totalRows: rows.length,
      createdCount,
      failedCount,
      results,
    };
  }

  static async countLocationsByManager(
    managerId: Types.ObjectId | string,
    organizationId: Types.ObjectId | string,
  ): Promise<number> {
    return await Location.countDocuments({
      managerId,
      organizationId,
    });
  }

  private static async resolveManagerIdByEmail(params: {
    managerEmail?: string;
    organizationId: Types.ObjectId | string;
  }): Promise<string | null> {
    const { managerEmail, organizationId } = params;
    if (!managerEmail) return null;

    const manager = await User.findOne({
      email: managerEmail.trim().toLowerCase(),
      organizationId,
    })
      .select("_id")
      .lean();

    if (!manager) {
      throw AppError.notFound("No existe un usuario con ese managerEmail", {
        code: "LOCATION_MANAGER_EMAIL_NOT_FOUND",
        managerEmail,
      });
    }

    return manager._id.toString();
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

  static async recalculateMaterialCapacitiesCurrentQuantity(params: {
    organizationId: Types.ObjectId | string;
    locationIds?: Array<Types.ObjectId | string>;
    session?: ClientSession;
  }): Promise<{ processed: number }> {
    const { organizationId, locationIds, session } = params;

    const locationQuery: Record<string, unknown> = { organizationId };
    if (locationIds && locationIds.length > 0) {
      locationQuery._id = {
        $in: locationIds.map((id) =>
          id instanceof Types.ObjectId ? id : new Types.ObjectId(String(id)),
        ),
      };
    }

    const query = Location.find(locationQuery).select("_id materialCapacities");
    if (session) {
      query.session(session);
    }

    const locations = await query;
    if (locations.length === 0) {
      return { processed: 0 };
    }

    const snapshots = await this.getLocationOccupancySnapshots({
      organizationId,
      locationIds: locations.map((location) => location._id),
      ...(session ? { session } : {}),
    });

    const bulkOps = locations.map((location) => {
      const snapshot = snapshots.get(location._id.toString());
      const materialCapacities = (location.materialCapacities ?? []).map((entry: any) => ({
        materialTypeId: entry.materialTypeId,
        maxQuantity: entry.maxQuantity,
        currentQuantity:
          snapshot?.byMaterialType.get(String(entry.materialTypeId)) ?? 0,
      }));

      return {
        updateOne: {
          filter: { _id: location._id },
          update: {
            $set: {
              materialCapacities,
            },
          },
        },
      };
    });

    if (bulkOps.length > 0) {
      await Location.bulkWrite(bulkOps, session ? { session } : undefined);
    }

    return { processed: locations.length };
  }
}

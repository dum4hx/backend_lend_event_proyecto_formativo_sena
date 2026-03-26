import { Types } from "mongoose";
import { Category } from "./models/category.model.ts";
import { MaterialModel } from "./models/material_type.model.ts";
import { MaterialAttribute } from "./models/material_attribute.model.ts";
import { MaterialInstance } from "./models/material_instance.model.ts";
import { InventoryMovement } from "./models/inventory_movement.model.ts";
import { LocationService } from "../location/location.service.ts";
import { AppError } from "../../errors/AppError.ts";
import { logger } from "../../utils/logger.ts";
import { renameProperty } from "../../utils/renameProperty.ts";
import { organizationService } from "../organization/organization.service.ts";
import { User } from "../user/models/user.model.ts";

type MaterialInstanceWritePayload = {
  modelId?: string;
  locationId?: string;
  serialNumber?: string;
  barcode?: string;
  useBarcodeAsSerial?: boolean;
  notes?: string;
  attributes?: Array<{ attributeId: string; value: string }>;
  force?: boolean;
};

const normalizeOptionalString = (
  value: unknown,
): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseDuplicateKeyError = (
  err: unknown,
): "serialNumber" | "barcode" | null => {
  if (
    err === null ||
    typeof err !== "object" ||
    !("code" in err) ||
    (err as { code: number }).code !== 11000
  ) {
    return null;
  }

  const keyPattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern;
  const keyValue = (err as { keyValue?: Record<string, unknown> }).keyValue;

  if (keyPattern?.barcode || keyValue?.barcode) return "barcode";
  if (keyPattern?.serialNumber || keyValue?.serialNumber) return "serialNumber";

  return "serialNumber";
};

const resolveEffectiveSerialAndBarcode = (opts: {
  useBarcodeAsSerial?: boolean | undefined;
  payloadSerial?: string | undefined;
  payloadBarcode?: string | undefined;
  currentSerial?: string | undefined;
  currentBarcode?: string | undefined;
  isCreate: boolean;
}): { serialNumber: string; barcode: string | undefined } => {
  const {
    useBarcodeAsSerial,
    payloadSerial,
    payloadBarcode,
    currentSerial,
    currentBarcode,
    isCreate,
  } = opts;

  const barcode = payloadBarcode ?? currentBarcode;

  if (useBarcodeAsSerial === true) {
    if (!barcode) {
      throw AppError.badRequest(
        "barcode is required when useBarcodeAsSerial is true",
      );
    }
    return { serialNumber: barcode, barcode };
  }

  if (useBarcodeAsSerial === false) {
    const serialNumber = payloadSerial ?? currentSerial;
    if (!serialNumber) {
      throw AppError.badRequest(
        "serialNumber is required when useBarcodeAsSerial is false",
      );
    }
    return { serialNumber, barcode };
  }

  // Backward-compatible mode: when the switch is omitted, preserve existing behavior.
  const serialNumber = payloadSerial ?? currentSerial;
  if (!serialNumber) {
    if (isCreate) {
      throw AppError.badRequest("serialNumber is required");
    }
    throw AppError.badRequest("serialNumber is required to update this record");
  }

  return { serialNumber, barcode };
};

/* ---------- Internal helpers ---------- */

/**
 * Validates that the attributes array being assigned to a material type is consistent:
 * - Each attributeId must belong to the organization.
 * - If an attribute has a categoryId, the material type must include that category.
 * - If an attribute has allowedValues, the provided value must be in the list.
 * - All isRequired attributes in scope (org-wide + matching category) must be present.
 *
 * @param organizationId - Organization to scope the attribute look-up.
 * @param categoryIds    - Category IDs assigned to the material type (array may be empty).
 * @param incoming       - The attribute/value pairs coming from the request.
 */
async function validateMaterialTypeAttributes(
  organizationId: Types.ObjectId | string,
  categoryIds: string[],
  incoming: Array<{ attributeId: string; value: string }>,
): Promise<void> {
  if (incoming.length === 0) {
    // Still need to check required attributes even when none are provided
    const requiredAttributes = await MaterialAttribute.find({
      organizationId,
      isRequired: true,
      $or: [
        { categoryId: null },
        { categoryId: { $exists: false } },
        ...(categoryIds.length > 0
          ? [{ categoryId: { $in: categoryIds } }]
          : []),
      ],
    });

    if (requiredAttributes.length > 0) {
      const missing = requiredAttributes.map((a) => a.name);
      throw AppError.badRequest(
        `Missing required attributes: ${missing.join(", ")}`,
        { code: "MISSING_REQUIRED_ATTRIBUTES", missing },
      );
    }
    return;
  }

  // Fetch all attributes referenced in the incoming payload
  const incomingIds = incoming.map((a) => a.attributeId);
  const foundAttributes = await MaterialAttribute.find({
    _id: { $in: incomingIds },
    organizationId,
  });

  const foundMap = new Map(foundAttributes.map((a) => [a._id.toString(), a]));

  // Validate each incoming entry
  for (const entry of incoming) {
    const attr = foundMap.get(entry.attributeId);

    if (!attr) {
      throw AppError.badRequest(
        `Attribute '${entry.attributeId}' not found in this organization`,
        { code: "ATTRIBUTE_NOT_FOUND", attributeId: entry.attributeId },
      );
    }

    // Category-scope check: if attribute is tied to a specific category, the type must belong to it
    if (attr.categoryId) {
      const requiredCategory = attr.categoryId.toString();
      if (!categoryIds.includes(requiredCategory)) {
        throw AppError.badRequest(
          `Attribute '${attr.name}' is restricted to category '${requiredCategory}'. ` +
            `The material type must belong to that category to use this attribute.`,
          {
            code: "ATTRIBUTE_CATEGORY_MISMATCH",
            attributeName: attr.name,
            requiredCategoryId: requiredCategory,
          },
        );
      }
    }

    // Allowed-values check
    if (
      Array.isArray(attr.allowedValues) &&
      attr.allowedValues.length > 0 &&
      !attr.allowedValues.includes(entry.value)
    ) {
      throw AppError.badRequest(
        `Value '${entry.value}' is not allowed for attribute '${attr.name}'. ` +
          `Allowed values: ${attr.allowedValues.join(", ")}`,
        {
          code: "INVALID_ATTRIBUTE_VALUE",
          attributeName: attr.name,
          value: entry.value,
          allowedValues: attr.allowedValues,
        },
      );
    }
  }

  // Build set of provided attribute IDs for the required-attributes check
  const providedIds = new Set(incoming.map((a) => a.attributeId));

  // Fetch all required attributes in scope for this material type
  const requiredAttributes = await MaterialAttribute.find({
    organizationId,
    isRequired: true,
    $or: [
      { categoryId: null },
      { categoryId: { $exists: false } },
      ...(categoryIds.length > 0 ? [{ categoryId: { $in: categoryIds } }] : []),
    ],
  });

  const missing = requiredAttributes
    .filter((a) => !providedIds.has(a._id.toString()))
    .map((a) => a.name);

  if (missing.length > 0) {
    throw AppError.badRequest(
      `Missing required attributes: ${missing.join(", ")}`,
      { code: "MISSING_REQUIRED_ATTRIBUTES", missing },
    );
  }
}

/* ---------- Material Service ---------- */

export const materialService = {
  /**
   * Deletes a material category within an organization.
   * Fails if any material types reference this category.
   */
  async deleteCategory(
    organizationId: Types.ObjectId | string,
    categoryId: Types.ObjectId | string,
  ): Promise<void> {
    const category = await Category.findOne({
      _id: categoryId,
      organizationId,
    });
    if (!category) {
      throw AppError.notFound("Category not found");
    }

    // If any material types reference this category, prevent deletion
    const linkedCount = await MaterialModel.countDocuments({
      organizationId,
      categoryId,
    });

    if (linkedCount > 0) {
      throw AppError.badRequest(
        "Cannot delete category while material types exist",
        { code: "CATEGORY_HAS_MATERIALS" },
      );
    }

    await Category.deleteOne({ _id: categoryId });

    logger.info("Material category deleted", {
      categoryId: categoryId.toString(),
      organizationId: organizationId.toString(),
    });
  },

  async listCategories(
    organizationId: Types.ObjectId | string,
  ): Promise<Awaited<ReturnType<typeof Category.find>>> {
    return Category.find({ organizationId }).sort({ name: 1 });
  },

  async createCategory(
    organizationId: Types.ObjectId | string,
    payload: Record<string, unknown>,
  ) {
    const toCreate = { ...payload, organizationId } as Record<string, unknown>;
    const category = await Category.create(toCreate);
    return category;
  },

  async updateCategory(
    organizationId: Types.ObjectId | string,
    categoryId: Types.ObjectId | string,
    updates: Record<string, unknown>,
  ) {
    const category = await Category.findById(categoryId);
    if (!category) {
      throw AppError.notFound("Category not found");
    }

    if (category.organizationId.toString() !== organizationId.toString()) {
      throw AppError.notFound("Category not found");
    }

    Object.assign(category, updates);
    await category.save();

    return category;
  },

  /* Material Types (Catalog) */
  async listMaterialTypes(
    opts: {
      page?: number | string | undefined;
      limit?: number | string | undefined;
      categoryId?: string | undefined;
      search?: string | undefined;
    },
    organizationId: Types.ObjectId | string,
  ) {
    const { page = 1, limit = 20, categoryId, search } = opts;
    const skip = (Number(page) - 1) * Number(limit);

    const query: Record<string, unknown> = {};
    query.organizationId = organizationId;

    if (categoryId) {
      query.categoryId = categoryId;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const [materialTypes, total, organizationTotal] = await Promise.all([
      MaterialModel.find(query)
        .skip(skip)
        .limit(Number(limit))
        .populate("categoryId", "name")
        .sort({ name: 1 }),
      MaterialModel.countDocuments(query),
      MaterialModel.countDocuments({ organizationId }),
    ]);

    return {
      materialTypes,
      total,
      organizationTotal,
      count: materialTypes.length,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    };
  },

  async getMaterialType(id: string, organizationId: Types.ObjectId | string) {
    const materialType = await MaterialModel.findOne({
      _id: id,
      organizationId,
    }).populate("categoryId", "name");

    if (!materialType) {
      throw AppError.notFound("Material type not found");
    }

    return materialType;
  },

  async createMaterialType(
    organizationId: Types.ObjectId | string,
    payload: Record<string, unknown>,
  ) {
    await organizationService.incrementCatalogItemCount(organizationId);

    try {
      // Resolve category IDs as strings for validation helpers
      const categoryIds: string[] = [];
      if (payload.categoryId) {
        const rawIds = Array.isArray(payload.categoryId)
          ? payload.categoryId
          : [payload.categoryId];
        for (const id of rawIds) {
          const category = await Category.findById(String(id));
          if (
            !category ||
            category.organizationId.toString() !== organizationId.toString()
          ) {
            throw AppError.notFound("Category not found");
          }
          categoryIds.push(String(id));
        }
      }

      // Validate attribute values
      const incomingAttributes = Array.isArray(payload.attributes)
        ? (payload.attributes as Array<{ attributeId: string; value: string }>)
        : [];
      await validateMaterialTypeAttributes(
        organizationId,
        categoryIds,
        incomingAttributes,
      );

      const toCreate = { ...payload, organizationId } as Record<
        string,
        unknown
      >;
      const materialType = await MaterialModel.create(toCreate);

      return materialType;
    } catch (err) {
      await organizationService.decrementCatalogItemCount(organizationId);
      throw err;
    }
  },

  async updateMaterialType(
    organizationId: Types.ObjectId | string,
    id: string,
    updates: Record<string, unknown>,
  ) {
    // If attributes are being updated, validate them before persisting
    if (updates.attributes !== undefined) {
      const existing = await MaterialModel.findOne({ _id: id, organizationId });
      if (!existing) {
        throw AppError.notFound("Material type not found");
      }

      // Merge category IDs: use updated list if provided, otherwise fall back to existing
      const rawCategoryIds = updates.categoryId ?? existing.categoryId;
      const categoryIds: string[] = Array.isArray(rawCategoryIds)
        ? rawCategoryIds.map(String)
        : rawCategoryIds
          ? [String(rawCategoryIds)]
          : [];

      // Merge attributes: the incoming update is the full new list
      const incomingAttributes = Array.isArray(updates.attributes)
        ? (updates.attributes as Array<{ attributeId: string; value: string }>)
        : [];
      await validateMaterialTypeAttributes(
        organizationId,
        categoryIds,
        incomingAttributes,
      );
    }

    const materialType = await MaterialModel.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!materialType) {
      throw AppError.notFound("Material type not found");
    }

    return materialType;
  },

  async deleteMaterialType(
    organizationId: Types.ObjectId | string,
    id: string,
  ) {
    const instanceCount = await MaterialInstance.countDocuments({
      modelId: id,
      organizationId,
    });

    if (instanceCount > 0) {
      throw AppError.badRequest(
        "Cannot delete material type with existing instances",
        { instanceCount },
      );
    }

    const materialType = await MaterialModel.findOneAndDelete({
      _id: id,
      organizationId,
    });

    if (!materialType) {
      throw AppError.notFound("Material type not found");
    }

    await organizationService.decrementCatalogItemCount(organizationId);

    return;
  },

  /* Material Instances */
  async listInstances(opts: {
    page?: number | string | undefined;
    limit?: number | string | undefined;
    status?: string | undefined;
    materialTypeId?: string | undefined;
    search?: string | undefined;
    organizationId?: Types.ObjectId | string | undefined;
    byLocation?: boolean | undefined;
  }) {
    const {
      page = 1,
      limit = 20,
      status,
      materialTypeId,
      search,
      organizationId,
      byLocation = false,
    } = opts;
    const skip = (Number(page) - 1) * Number(limit);

    const match: Record<string, unknown> = {};
    if (organizationId) {
      match.organizationId = new Types.ObjectId(String(organizationId));
    }
    if (status) match.status = status;
    if (materialTypeId) {
      match.modelId = new Types.ObjectId(String(materialTypeId));
    }
    if (search) match.serialNumber = { $regex: search, $options: "i" };

    if (!byLocation) {
      const [instances, total] = await Promise.all([
        MaterialInstance.find(match)
          .skip(skip)
          .limit(Number(limit))
          .populate("modelId", "name description pricePerDay")
          .populate("locationId", "name")
          .sort({ createdAt: -1 }),
        MaterialInstance.countDocuments(match),
      ]);

      return {
        instances,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      };
    }

    const pipeline = [
      { $match: match },
      { $sort: { createdAt: -1 as const } },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          paginatedData: [
            { $skip: skip },
            { $limit: Number(limit) },
            {
              $lookup: {
                from: "materialtypes",
                localField: "modelId",
                foreignField: "_id",
                as: "model",
              },
            },
            { $unwind: { path: "$model", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "locations",
                localField: "locationId",
                foreignField: "_id",
                as: "location",
              },
            },
            {
              $unwind: { path: "$location", preserveNullAndEmptyArrays: true },
            },
            {
              $group: {
                _id: "$location._id",
                location: {
                  $first: {
                    $ifNull: ["$location", { _id: "unknown", name: "Unknown" }],
                  },
                },
                instances: { $push: "$$ROOT" },
              },
            },
            {
              $project: {
                "instances.locationId": 0,
                "instances.modelId": 0,
                "instances.location": 0,
              },
            },
          ],
        },
      },
    ];

    const [result] = await MaterialInstance.aggregate(pipeline);

    const total = result.totalCount[0]?.count ?? 0;
    const groupedData = result.paginatedData;

    return {
      byLocation: groupedData,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    };
  },

  /**
   * Returns all material instances for the organization split into two groups:
   * - currentUserLocations: instances whose locationId is in the user's assigned locations
   * - otherLocations: all remaining instances
   */
  async listInstancesByUserLocation(opts: {
    status?: string | undefined;
    materialTypeId?: string | undefined;
    search?: string | undefined;
    organizationId?: Types.ObjectId | string | undefined;
    userId: Types.ObjectId | string;
  }) {
    const { status, materialTypeId, search, organizationId, userId } = opts;

    const user = await User.findById(userId).select("locations").lean();
    if (!user) {
      throw AppError.notFound("User not found");
    }

    const userLocationIds: Types.ObjectId[] = (user.locations ?? []).map(
      (id) => new Types.ObjectId(String(id)),
    );

    const match: Record<string, unknown> = {};
    if (organizationId) {
      match.organizationId = new Types.ObjectId(String(organizationId));
    }
    if (status) match.status = status;
    if (materialTypeId) {
      match.modelId = new Types.ObjectId(String(materialTypeId));
    }
    if (search) match.serialNumber = { $regex: search, $options: "i" };

    const pipeline = [
      { $match: match },
      { $sort: { createdAt: -1 as const } },
      {
        $lookup: {
          from: "materialtypes",
          localField: "modelId",
          foreignField: "_id",
          as: "model",
        },
      },
      { $unwind: { path: "$model", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "locations",
          localField: "locationId",
          foreignField: "_id",
          as: "location",
        },
      },
      { $unwind: { path: "$location", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          isUserLocation: {
            $in: ["$locationId", userLocationIds],
          },
        },
      },
      {
        $facet: {
          currentUserLocations: [
            { $match: { isUserLocation: true } },
            {
              $group: {
                _id: "$location._id",
                location: {
                  $first: {
                    $ifNull: ["$location", { _id: "unknown", name: "Unknown" }],
                  },
                },
                instances: { $push: "$$ROOT" },
              },
            },
            {
              $project: {
                "instances.locationId": 0,
                "instances.modelId": 0,
                "instances.location": 0,
                "instances.isUserLocation": 0,
              },
            },
          ],
          otherLocations: [
            { $match: { isUserLocation: false } },
            {
              $group: {
                _id: "$location._id",
                location: {
                  $first: {
                    $ifNull: ["$location", { _id: "unknown", name: "Unknown" }],
                  },
                },
                instances: { $push: "$$ROOT" },
              },
            },
            {
              $project: {
                "instances.locationId": 0,
                "instances.modelId": 0,
                "instances.location": 0,
                "instances.isUserLocation": 0,
              },
            },
          ],
        },
      },
    ];

    const [result] = await MaterialInstance.aggregate(pipeline);

    return {
      currentUserLocations: result.currentUserLocations,
      otherLocations: result.otherLocations,
    };
  },

  async getInstance(id: string, organizationId?: Types.ObjectId | string) {
    const query: Record<string, unknown> = { _id: id };
    if (organizationId) query.organizationId = organizationId;

    const instance = await MaterialInstance.findOne(query).populate(
      "modelId",
      "name description pricePerDay categoryId",
    );

    if (!instance) {
      throw AppError.notFound("Material instance not found");
    }

    return renameProperty(instance, "modelId", "model");
  },

  async createInstance(
    organizationId: Types.ObjectId | string,
    payload: Record<string, unknown>,
  ) {
    const writePayload = payload as MaterialInstanceWritePayload;

    if (!payload.modelId) {
      throw AppError.badRequest("Material type (modelId) is required");
    }

    const materialType = await MaterialModel.findById(String(payload.modelId));
    if (!materialType) {
      throw AppError.notFound("Material type not found");
    }

    if (payload.locationId) {
      const locationActive = await LocationService.locationExists(
        String(payload.locationId),
        String(organizationId),
        true,
      );
      if (!locationActive) {
        throw AppError.badRequest(
          "Target location is either not found or inactive",
          { locationId: payload.locationId },
        );
      }

      // Check capacity for the specific material type at the target location
      await LocationService.validateCapacity(
        String(payload.locationId),
        String(payload.modelId),
        String(organizationId),
        payload.force === true,
      );
    }

    const payloadSerial = normalizeOptionalString(writePayload.serialNumber);
    const payloadBarcode = normalizeOptionalString(writePayload.barcode);
    const { serialNumber, barcode } = resolveEffectiveSerialAndBarcode({
      useBarcodeAsSerial: writePayload.useBarcodeAsSerial,
      payloadSerial,
      payloadBarcode,
      currentSerial: undefined,
      currentBarcode: undefined,
      isCreate: true,
    });

    const toCreate = {
      ...payload,
      serialNumber,
      ...(barcode ? { barcode } : { barcode: undefined }),
      organizationId,
    } as Record<string, unknown>;

    let instance;
    try {
      instance = await MaterialInstance.create(toCreate);
    } catch (err: unknown) {
      const duplicateField = parseDuplicateKeyError(err);
      if (duplicateField === "barcode") {
        throw AppError.conflict("Barcode already exists in this organization");
      }
      if (duplicateField === "serialNumber") {
        throw AppError.conflict(
          "A material instance with that serial number already exists in this organization",
        );
      }
      throw err;
    }
    // Populate the model field before returning
    await instance.populate(
      "modelId",
      "name description pricePerDay categoryId",
    );
    return renameProperty(instance, "modelId", "model");
  },

  async updateInstance(
    organizationId: Types.ObjectId | string,
    id: string,
    payload: Record<string, unknown>,
  ) {
    const writePayload = payload as MaterialInstanceWritePayload;

    const instance = await MaterialInstance.findOne({
      _id: id,
      organizationId,
    });

    if (!instance) {
      throw AppError.notFound("Material instance not found");
    }

    if (writePayload.modelId) {
      const materialType = await MaterialModel.findById(String(writePayload.modelId));
      if (!materialType) {
        throw AppError.notFound("Material type not found");
      }
    }

    if (writePayload.locationId) {
      const locationActive = await LocationService.locationExists(
        String(writePayload.locationId),
        String(organizationId),
        true,
      );
      if (!locationActive) {
        throw AppError.badRequest(
          "Target location is either not found or inactive",
          { locationId: writePayload.locationId },
        );
      }

      await LocationService.validateCapacity(
        String(writePayload.locationId),
        String(writePayload.modelId ?? instance.modelId),
        String(organizationId),
        writePayload.force === true,
      );
    }

    const payloadSerial = normalizeOptionalString(writePayload.serialNumber);
    const payloadBarcode = normalizeOptionalString(writePayload.barcode);
    const currentSerial = normalizeOptionalString(instance.serialNumber);
    const currentBarcode = normalizeOptionalString(instance.barcode);

    const { serialNumber, barcode } = resolveEffectiveSerialAndBarcode({
      useBarcodeAsSerial: writePayload.useBarcodeAsSerial,
      payloadSerial,
      payloadBarcode,
      currentSerial,
      currentBarcode,
      isCreate: false,
    });

    const updatePayload: Record<string, unknown> = {
      ...(writePayload.modelId ? { modelId: writePayload.modelId } : {}),
      ...(writePayload.locationId ? { locationId: writePayload.locationId } : {}),
      ...(writePayload.notes !== undefined ? { notes: writePayload.notes } : {}),
      ...(writePayload.attributes !== undefined
        ? { attributes: writePayload.attributes }
        : {}),
      serialNumber,
      barcode,
    };

    let updated;
    try {
      updated = await MaterialInstance.findOneAndUpdate(
        { _id: id, organizationId },
        updatePayload,
        { new: true, runValidators: true },
      )
        .populate("modelId", "name description pricePerDay categoryId")
        .populate("locationId", "name");
    } catch (err: unknown) {
      const duplicateField = parseDuplicateKeyError(err);
      if (duplicateField === "barcode") {
        throw AppError.conflict("Barcode already exists in this organization");
      }
      if (duplicateField === "serialNumber") {
        throw AppError.conflict(
          "A material instance with that serial number already exists in this organization",
        );
      }
      throw err;
    }

    if (!updated) {
      throw AppError.notFound("Material instance not found");
    }

    return renameProperty(updated, "modelId", "model");
  },

  /**
   * Scans for a material instance by barcode (exact) then by serialNumber (exact).
   * Scoped to the authenticated user's organization.
   */
  async scanInstance(
    organizationId: Types.ObjectId | string,
    code: string,
  ): Promise<{ instance: unknown; matchedBy: "barcode" | "serialNumber" }> {
    const orgFilter = { organizationId: new Types.ObjectId(String(organizationId)) };

    let instance = await MaterialInstance.findOne({
      ...orgFilter,
      barcode: code,
    })
      .populate("modelId", "name description pricePerDay categoryId")
      .populate("locationId", "name");

    if (instance) {
      return { instance: renameProperty(instance, "modelId", "model"), matchedBy: "barcode" };
    }

    instance = await MaterialInstance.findOne({
      ...orgFilter,
      serialNumber: code,
    })
      .populate("modelId", "name description pricePerDay categoryId")
      .populate("locationId", "name");

    if (instance) {
      return { instance: renameProperty(instance, "modelId", "model"), matchedBy: "serialNumber" };
    }

    throw AppError.notFound("No material instance found for scanned code");
  },

  async updateInstanceStatus(
    organizationId: Types.ObjectId | string,
    id: string,
    status: string,
    notes?: string,
    actorUserId?: Types.ObjectId | string,
    source: "manual" | "scanner" | "system" = "manual",
  ) {
    const instance = await MaterialInstance.findOne({
      _id: id,
      organizationId,
    });
    if (!instance) {
      throw AppError.notFound("Material instance not found");
    }

    const validTransitions: Record<string, string[]> = {
      available: ["reserved", "maintenance", "damaged", "retired"],
      reserved: ["available", "loaned"],
      loaned: ["returned"],
      returned: ["available", "maintenance", "damaged"],
      maintenance: ["available", "retired"],
      damaged: ["maintenance", "retired"],
      lost: ["retired"],
      retired: [],
    };

    const currentStatus = instance.status;

    // Idempotent: same status requested → return success without recording movement
    if (currentStatus === status) {
      return renameProperty(instance, "modelId", "model");
    }

    const allowedTransitions = validTransitions[currentStatus] ?? [];

    if (!allowedTransitions.includes(status)) {
      throw AppError.badRequest(
        `Invalid status transition from '${currentStatus}' to '${status}'`,
        { currentStatus, requestedStatus: status, allowedTransitions },
      );
    }

    instance.status = status;
    if (notes) instance.notes = notes;

    await instance.save();

    // Record audit movement
    if (actorUserId) {
      const movementDoc: Record<string, unknown> = {
        organizationId,
        materialInstanceId: instance._id,
        movementType: "status_change",
        previousStatus: currentStatus,
        newStatus: status,
        source,
        actorUserId,
        ...(notes ? { notes } : {}),
      };
      await InventoryMovement.create(movementDoc);
    }

    return renameProperty(instance, "modelId", "model");
  },

  async deleteInstance(organizationId: Types.ObjectId | string, id: string) {
    const instance = await MaterialInstance.findOne({
      _id: id,
      organizationId,
    });

    if (!instance) {
      throw AppError.notFound("Material instance not found");
    }

    if (!["available", "retired"].includes(instance.status)) {
      throw AppError.badRequest(
        "Can only delete available or retired material instances",
      );
    }

    await MaterialInstance.deleteOne({ _id: id });

    return;
  },

  /* ---------- Material Attributes ---------- */

  async listAttributes(
    organizationId: Types.ObjectId | string,
    opts?: { categoryId?: string },
  ) {
    const query: Record<string, unknown> = { organizationId };
    if (opts?.categoryId) {
      query.categoryId = opts.categoryId;
    }
    return MaterialAttribute.find(query).sort({ name: 1 });
  },

  async getAttribute(id: string, organizationId: Types.ObjectId | string) {
    const attribute = await MaterialAttribute.findOne({
      _id: id,
      organizationId,
    });
    if (!attribute) {
      throw AppError.notFound("Material attribute not found");
    }
    return attribute;
  },

  async createAttribute(
    organizationId: Types.ObjectId | string,
    payload: Record<string, unknown>,
  ) {
    const toCreate = { ...payload, organizationId };
    try {
      const attribute = await MaterialAttribute.create(toCreate);
      return attribute;
    } catch (err: unknown) {
      if (
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: number }).code === 11000
      ) {
        throw AppError.conflict(
          "An attribute with that name already exists in this organization",
        );
      }
      throw err;
    }
  },

  async updateAttribute(
    organizationId: Types.ObjectId | string,
    id: string,
    updates: Record<string, unknown>,
  ) {
    const attribute = await MaterialAttribute.findOne({
      _id: id,
      organizationId,
    });
    if (!attribute) {
      throw AppError.notFound("Material attribute not found");
    }

    // Block narrowing of allowedValues when existing material types would become invalid
    if (
      Array.isArray(updates.allowedValues) &&
      (updates.allowedValues as string[]).length > 0
    ) {
      const newAllowed = updates.allowedValues as string[];
      const invalid = await MaterialModel.findOne({
        organizationId,
        "attributes.attributeId": attribute._id,
        "attributes.value": { $nin: newAllowed },
      });
      if (invalid) {
        throw AppError.badRequest(
          "Cannot restrict allowedValues: one or more material types have values " +
            "that are not in the new allowed list. Update those material types first.",
          { code: "ALLOWED_VALUES_IN_USE" },
        );
      }
    }

    // Block changing categoryId when existing users would fall out of scope
    if (
      updates.categoryId !== undefined &&
      String(updates.categoryId ?? "") !== String(attribute.categoryId ?? "")
    ) {
      const newCategoryId = updates.categoryId
        ? String(updates.categoryId)
        : null;
      if (newCategoryId) {
        const outOfScope = await MaterialModel.findOne({
          organizationId,
          "attributes.attributeId": attribute._id,
          categoryId: { $ne: newCategoryId },
        });
        if (outOfScope) {
          throw AppError.badRequest(
            "Cannot change categoryId: one or more material types use this attribute " +
              "but do not belong to the target category. Update those material types first.",
            { code: "ATTRIBUTE_CATEGORY_IN_USE" },
          );
        }
      }
    }

    Object.assign(attribute, updates);
    try {
      await attribute.save();
    } catch (err: unknown) {
      if (
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: number }).code === 11000
      ) {
        throw AppError.conflict(
          "An attribute with that name already exists in this organization",
        );
      }
      throw err;
    }
    return attribute;
  },

  async deleteAttribute(organizationId: Types.ObjectId | string, id: string) {
    const attribute = await MaterialAttribute.findOne({
      _id: id,
      organizationId,
    });
    if (!attribute) {
      throw AppError.notFound("Material attribute not found");
    }

    const usageCount = await MaterialModel.countDocuments({
      organizationId,
      "attributes.attributeId": attribute._id,
    });

    if (usageCount > 0) {
      throw AppError.conflict(
        `Cannot delete attribute '${attribute.name}': it is used by ${usageCount} material type(s). ` +
          "Remove the attribute from those material types first.",
      );
    }

    await MaterialAttribute.deleteOne({ _id: id });
  },
};

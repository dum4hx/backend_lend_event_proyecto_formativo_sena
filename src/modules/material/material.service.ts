import { type PipelineStage, Types } from "mongoose";
import { Category } from "./models/category.model.ts";
import { MaterialModel } from "./models/material_type.model.ts";
import { MaterialAttribute } from "./models/material_attribute.model.ts";
import { MaterialInstance } from "./models/material_instance.model.ts";
import { InventoryMovement } from "./models/inventory_movement.model.ts";
import { LocationService } from "../location/location.service.ts";
import { Loan } from "../loan/models/loan.model.ts";
import { LoanRequest } from "../request/models/request.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { logger } from "../../utils/logger.ts";
import { renameProperty } from "../../utils/renameProperty.ts";
import { organizationService } from "../organization/organization.service.ts";
import { User } from "../user/models/user.model.ts";
import { MATERIAL_TRANSITIONS } from "../shared/state_machine.ts";
import { codeGenerationService } from "../code_scheme/code_generation.service.ts";

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

const normalizeOptionalString = (value: unknown): string | undefined => {
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

  const keyPattern = (err as { keyPattern?: Record<string, unknown> })
    .keyPattern;
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
        "barcode es requerido cuando useBarcodeAsSerial es true",
      );
    }
    return { serialNumber: barcode, barcode };
  }

  if (useBarcodeAsSerial === false) {
    const serialNumber = payloadSerial ?? currentSerial;
    if (!serialNumber) {
      throw AppError.badRequest(
        "serialNumber es requerido cuando useBarcodeAsSerial es false",
      );
    }
    return { serialNumber, barcode };
  }

  // Backward-compatible mode: when the switch is omitted, preserve existing behavior.
  const serialNumber = payloadSerial ?? currentSerial;
  if (!serialNumber) {
    if (isCreate) {
      throw AppError.badRequest("serialNumber es requerido");
    }
    throw AppError.badRequest(
      "serialNumber es requerido para actualizar este registro",
    );
  }

  return { serialNumber, barcode };
};

type LoanContextSource = "loan" | "request";

type MaterialInstanceLoanContext = {
  loanId: string | null;
  loanCode: string | null;
  requestId: string | null;
  requestCode: string | null;
  source: LoanContextSource | null;
};

const EMPTY_LOAN_CONTEXT: MaterialInstanceLoanContext = {
  loanId: null,
  loanCode: null,
  requestId: null,
  requestCode: null,
  source: null,
};

const INSTANCE_STATUSES_WITH_RELATION_CONTEXT = new Set(["reserved", "loaned"]);

const REQUEST_RELATION_STATUSES_BY_INSTANCE_STATUS: Record<string, string[]> = {
  reserved: ["assigned", "ready"],
  loaned: ["shipped", "completed", "assigned", "ready"],
};

async function resolveMaterialInstanceLoanContext(args: {
  organizationId: Types.ObjectId | string;
  materialInstanceId: Types.ObjectId | string;
  instanceStatus: string;
}): Promise<MaterialInstanceLoanContext> {
  const { organizationId, materialInstanceId, instanceStatus } = args;

  if (!INSTANCE_STATUSES_WITH_RELATION_CONTEXT.has(instanceStatus)) {
    return EMPTY_LOAN_CONTEXT;
  }

  const normalizedOrganizationId =
    typeof organizationId === "string"
      ? new Types.ObjectId(organizationId)
      : organizationId;
  const normalizedInstanceId =
    typeof materialInstanceId === "string"
      ? new Types.ObjectId(materialInstanceId)
      : materialInstanceId;

  const activeLoan = await Loan.findOne({
    organizationId: normalizedOrganizationId,
    "materialInstances.materialInstanceId": normalizedInstanceId,
    status: { $in: ["active", "overdue"] },
  })
    .select("_id code requestId")
    .sort({ createdAt: -1 })
    .lean();

  if (activeLoan) {
    const linkedRequest = await LoanRequest.findOne({
      _id: activeLoan.requestId,
      organizationId: normalizedOrganizationId,
    })
      .select("_id code")
      .lean();

    return {
      loanId: activeLoan._id.toString(),
      loanCode: activeLoan.code ?? null,
      requestId: linkedRequest?._id?.toString() ?? null,
      requestCode: linkedRequest?.code ?? null,
      source: "loan",
    };
  }

  const requestStatuses: string[] =
    REQUEST_RELATION_STATUSES_BY_INSTANCE_STATUS[instanceStatus] ??
      REQUEST_RELATION_STATUSES_BY_INSTANCE_STATUS.loaned ?? [
        "shipped",
        "completed",
        "assigned",
        "ready",
      ];

  const relatedRequest = await LoanRequest.findOne({
    organizationId: normalizedOrganizationId,
    "assignedMaterials.materialInstanceId": normalizedInstanceId,
    status: { $in: requestStatuses },
  })
    .select("_id code")
    .sort({ createdAt: -1 })
    .lean();

  if (!relatedRequest) {
    return EMPTY_LOAN_CONTEXT;
  }

  return {
    loanId: null,
    loanCode: null,
    requestId: relatedRequest._id.toString(),
    requestCode: relatedRequest.code ?? null,
    source: "request",
  };
}

/* ---------- Internal helpers ---------- */

/**
 * Validates that the attributes array being assigned to a material type is consistent:
 * - Each attributeId must belong to the organization.
 * - If an attribute has a categoryId, the material type must include that category.
 * - If an attribute has allowedValues, the provided value must be in the list.
 * - For per-MaterialType required attributes, all marked as isRequired must have valid values.
 *
 * @param organizationId - Organization to scope the attribute look-up.
 * @param categoryIds    - Category IDs assigned to the material type (array may be empty).
 * @param incoming       - The attribute/value/isRequired tuples coming from the request.
 */
async function validateMaterialTypeAttributes(
  organizationId: Types.ObjectId | string,
  categoryIds: string[],
  incoming: Array<{ attributeId: string; value: string; isRequired?: boolean }>,
): Promise<void> {
  // If no categories, no inherited attributes to validate
  if (categoryIds.length === 0) {
    return;
  }

  // If no attributes provided, that's OK (type can have zero attributes)
  if (incoming.length === 0) {
    return;
  }

  // Fetch all categories and their defined attributes
  const categories = await Category.find({
    _id: { $in: categoryIds },
    organizationId,
  });

  if (categories.length === 0) {
    throw AppError.badRequest(
      `No se encontraron categorías válidas para este tipo de material`,
      { code: "INVALID_CATEGORIES" },
    );
  }

  // Build set of all attributes available from categories
  const categoryAttributeMap = new Map<string, { isRequired: boolean }>();
  for (const category of categories) {
    if (Array.isArray(category.attributes)) {
      for (const catAttr of category.attributes) {
        const attrId = catAttr.attributeId.toString();
        // Store the most restrictive isRequired (true if any category requires it)
        categoryAttributeMap.set(attrId, {
          isRequired:
            categoryAttributeMap.get(attrId)?.isRequired || catAttr.isRequired,
        });
      }
    }
  }

  // Fetch full attribute definitions for validation
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
        `Atributo '${entry.attributeId}' no encontrado en esta organización`,
        { code: "ATTRIBUTE_NOT_FOUND", attributeId: entry.attributeId },
      );
    }

    // Check if this attribute is available from the type's categories
    if (!categoryAttributeMap.has(entry.attributeId)) {
      throw AppError.badRequest(
        `Atributo '${attr.name}' no está disponible para estas categorías`,
        {
          code: "ATTRIBUTE_NOT_IN_CATEGORY",
          attributeName: attr.name,
          attributeId: entry.attributeId,
        },
      );
    }

    // Allowed-values check
    if (
      Array.isArray(attr.allowedValues) &&
      attr.allowedValues.length > 0 &&
      !attr.allowedValues.includes(entry.value)
    ) {
      throw AppError.badRequest(
        `Valor '${entry.value}' no está permitido para el atributo '${attr.name}'. ` +
          `Valores permitidos: ${attr.allowedValues.join(", ")}`,
        {
          code: "INVALID_ATTRIBUTE_VALUE",
          attributeName: attr.name,
          value: entry.value,
          allowedValues: attr.allowedValues,
        },
      );
    }
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
      throw AppError.notFound("Categoría no encontrada");
    }

    // If any material types reference this category, prevent deletion
    const linkedCount = await MaterialModel.countDocuments({
      organizationId,
      categoryId,
    });

    if (linkedCount > 0) {
      throw AppError.badRequest(
        "No se puede eliminar la categoría mientras existan tipos de material",
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
    if (payload.code) {
      const existingCode = await Category.findOne({
        organizationId,
        code: payload.code,
      });
      if (existingCode) {
        throw AppError.conflict(
          "Ya existe una categoría con este código en la organización",
        );
      }
    }
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
      throw AppError.notFound("Categoría no encontrada");
    }

    if (category.organizationId.toString() !== organizationId.toString()) {
      throw AppError.notFound("Categoría no encontrada");
    }

    if (typeof updates.code === "string" && updates.code !== category.code) {
      const existingCode = await Category.findOne({
        organizationId,
        code: updates.code,
        _id: { $ne: categoryId },
      });
      if (existingCode) {
        throw AppError.conflict(
          "Ya existe una categoría con este código en la organización",
        );
      }
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
      throw AppError.notFound("Tipo de material no encontrado");
    }

    return materialType;
  },

  async createMaterialType(
    organizationId: Types.ObjectId | string,
    payload: Record<string, unknown>,
  ) {
    await organizationService.incrementCatalogItemCount(organizationId);

    try {
      // Check duplicate code
      if (payload.code) {
        const existingCode = await MaterialModel.findOne({
          organizationId,
          code: payload.code,
        });
        if (existingCode) {
          throw AppError.conflict(
            "Ya existe un tipo de material con este código en la organización",
          );
        }
      }

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
            throw AppError.notFound("Categoría no encontrada");
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
        throw AppError.notFound("Tipo de material no encontrado");
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

    // Check duplicate code
    if (typeof updates.code === "string") {
      const existingCode = await MaterialModel.findOne({
        organizationId,
        code: updates.code,
        _id: { $ne: id },
      });
      if (existingCode) {
        throw AppError.conflict(
          "Ya existe un tipo de material con este código en la organización",
        );
      }
    }

    const materialType = await MaterialModel.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!materialType) {
      throw AppError.notFound("Tipo de material no encontrado");
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
        "No se puede eliminar el tipo de material con instancias existentes",
        { instanceCount },
      );
    }

    const materialType = await MaterialModel.findOneAndDelete({
      _id: id,
      organizationId,
    });

    if (!materialType) {
      throw AppError.notFound("Tipo de material no encontrado");
    }

    await organizationService.decrementCatalogItemCount(organizationId);

    return;
  },

  /* Material Instances */
  async getUserLocationIds(
    userId: Types.ObjectId | string,
  ): Promise<Types.ObjectId[]> {
    const user = await User.findById(userId).select("locations").lean();
    if (!user) return [];
    return (user.locations ?? []).map((id) => new Types.ObjectId(String(id)));
  },

  async listInstances(opts: {
    page?: number | string | undefined;
    limit?: number | string | undefined;
    status?: string | undefined;
    materialTypeId?: string | undefined;
    search?: string | undefined;
    organizationId?: Types.ObjectId | string | undefined;
    byLocation?: boolean | undefined;
    locationIds?: Types.ObjectId[] | undefined;
  }) {
    const {
      page = 1,
      limit = 20,
      status,
      materialTypeId,
      search,
      organizationId,
      byLocation = false,
      locationIds,
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
    if (locationIds && locationIds.length > 0) {
      match.locationId = { $in: locationIds };
    }

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
      throw AppError.notFound("Usuario no encontrado");
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

  /**
   * Returns a comprehensive operational overview of the catalog and item status.
   *
   * Scope:
   * - Organization-wide (default) — aggregates across ALL locations.
   * - Location-specific — filtered by `locationId`.
   *
   * Design decision: single endpoint with optional `locationId` param.
   * The only logic difference between org-level and location-level is one
   * additional `$match` filter. Separate endpoints would duplicate the entire
   * aggregation pipeline for negligible gain.
   *
   * The entire computation is done inside MongoDB via a single aggregation
   * pipeline — no instances are loaded into application memory.
   *
   * Alert thresholds:
   * - LOW_STOCK   : available < 20% of total AND available < 5 units
   * - HIGH_UTILIZATION : (loaned + in_use) / total > 0.8
   * - HIGH_DAMAGE_RATE : damaged / total > 0.1 → high | > 0.05 → medium
   * - OVER_RESERVED : reserved > available
   */
  async getCatalogOverview(opts: {
    organizationId: Types.ObjectId | string;
    locationId?: string;
    categoryId?: string;
    materialTypeId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      organizationId,
      locationId,
      categoryId,
      materialTypeId,
      search,
      page = 1,
      limit = 50,
    } = opts;

    const skip = (page - 1) * limit;

    // ── Stage 1: match instances by org (and optionally location) ──────────
    // All fields in $match are indexed on MaterialInstance.
    const instanceMatch: Record<string, unknown> = {
      organizationId: new Types.ObjectId(String(organizationId)),
    };
    if (locationId) {
      instanceMatch.locationId = new Types.ObjectId(locationId);
    }

    // ── Stage 2: type-level $match filters (applied after $lookup) ─────────
    const typeMatch: Record<string, unknown> = {};
    if (materialTypeId) {
      typeMatch["type._id"] = new Types.ObjectId(materialTypeId);
    }
    if (categoryId) {
      typeMatch["type.categoryId"] = new Types.ObjectId(categoryId);
    }
    if (search) {
      typeMatch["type.name"] = { $regex: search, $options: "i" };
    }

    // Helper: extract a specific status count from the statusCounts array.
    const statusCount = (statusValue: string) => ({
      $reduce: {
        input: "$statusCounts",
        initialValue: 0,
        in: {
          $cond: [
            { $eq: ["$$this.status", statusValue] },
            { $add: ["$$value", "$$this.count"] },
            "$$value",
          ],
        },
      },
    });

    // Helper: safe division (returns 0 when divisor is 0).
    const safeDivide = (
      numerator: Record<string, unknown>,
      divisor: string,
    ) => ({
      $cond: [
        { $gt: [`$${divisor}`, 0] },
        { $divide: [numerator, `$${divisor}`] },
        0,
      ],
    });

    const pipeline: PipelineStage[] = [
      // ── 1. Filter instances ────────────────────────────────────────────────
      { $match: instanceMatch },

      // ── 2. Count instances per (modelId, status) pair ────────────────────
      {
        $group: {
          _id: { modelId: "$modelId", status: "$status" },
          count: { $sum: 1 },
        },
      },

      // ── 3. Pivot to one doc per modelId with statusCounts array ───────────
      {
        $group: {
          _id: "$_id.modelId",
          totalInstances: { $sum: "$count" },
          statusCounts: {
            $push: { status: "$_id.status", count: "$count" },
          },
        },
      },

      // ── 4. Join material type metadata ────────────────────────────────────
      {
        $lookup: {
          from: "materialtypes",
          localField: "_id",
          foreignField: "_id",
          as: "type",
        },
      },
      { $unwind: { path: "$type", preserveNullAndEmptyArrays: true } },

      // ── 5. Apply type-level filters (categoryId, materialTypeId, search) ──
      ...(Object.keys(typeMatch).length > 0 ? [{ $match: typeMatch }] : []),

      // ── 6. Join category metadata ─────────────────────────────────────────
      {
        $lookup: {
          from: "categories",
          localField: "type.categoryId",
          foreignField: "_id",
          as: "categories",
        },
      },

      // ── 7. Compute individual status counts from the pivot array ──────────
      {
        $addFields: {
          available: statusCount("available"),
          reserved: statusCount("reserved"),
          loaned: statusCount("loaned"),
          inUse: statusCount("in_use"),
          returned: statusCount("returned"),
          maintenance: statusCount("maintenance"),
          damaged: statusCount("damaged"),
          lost: statusCount("lost"),
          retired: statusCount("retired"),
        },
      },

      // ── 8. Compute operational metrics ────────────────────────────────────
      {
        $addFields: {
          "metrics.availabilityRate": safeDivide(
            { $toDouble: "$available" },
            "totalInstances",
          ),
          "metrics.utilizationRate": {
            $cond: [
              { $gt: ["$totalInstances", 0] },
              {
                $divide: [
                  { $add: ["$loaned", "$inUse"] },
                  { $toDouble: "$totalInstances" },
                ],
              },
              0,
            ],
          },
          "metrics.damageRate": safeDivide(
            { $toDouble: "$damaged" },
            "totalInstances",
          ),
          "metrics.repairRate": safeDivide(
            { $toDouble: "$maintenance" },
            "totalInstances",
          ),
          "metrics.reservationPressure": safeDivide(
            { $toDouble: "$reserved" },
            "totalInstances",
          ),
        },
      },

      // ── 9. Compute smart alerts ───────────────────────────────────────────
      {
        $addFields: {
          alerts: {
            $concatArrays: [
              // LOW_STOCK: available < 20% of total AND available < 5
              {
                $cond: [
                  {
                    $and: [
                      {
                        $lt: [
                          "$available",
                          { $multiply: ["$totalInstances", 0.2] },
                        ],
                      },
                      { $lt: ["$available", 5] },
                      { $gt: ["$totalInstances", 0] },
                    ],
                  },
                  [
                    {
                      type: "LOW_STOCK",
                      severity: {
                        $cond: [{ $eq: ["$available", 0] }, "high", "medium"],
                      },
                    },
                  ],
                  [],
                ],
              },
              // HIGH_UTILIZATION: (loaned + in_use) / total > 0.8
              {
                $cond: [
                  {
                    $and: [
                      { $gt: ["$totalInstances", 0] },
                      {
                        $gt: [
                          {
                            $divide: [
                              { $add: ["$loaned", "$inUse"] },
                              { $toDouble: "$totalInstances" },
                            ],
                          },
                          0.8,
                        ],
                      },
                    ],
                  },
                  [{ type: "HIGH_UTILIZATION", severity: "high" }],
                  [],
                ],
              },
              // HIGH_DAMAGE_RATE: damaged / total > 0.05
              {
                $cond: [
                  {
                    $and: [
                      { $gt: ["$totalInstances", 0] },
                      {
                        $gt: [
                          {
                            $divide: [
                              { $toDouble: "$damaged" },
                              { $toDouble: "$totalInstances" },
                            ],
                          },
                          0.1,
                        ],
                      },
                    ],
                  },
                  [{ type: "HIGH_DAMAGE_RATE", severity: "high" }],
                  {
                    $cond: [
                      {
                        $and: [
                          { $gt: ["$totalInstances", 0] },
                          {
                            $gt: [
                              {
                                $divide: [
                                  { $toDouble: "$damaged" },
                                  { $toDouble: "$totalInstances" },
                                ],
                              },
                              0.05,
                            ],
                          },
                        ],
                      },
                      [{ type: "HIGH_DAMAGE_RATE", severity: "medium" }],
                      [],
                    ],
                  },
                ],
              },
              // OVER_RESERVED: reserved > available
              {
                $cond: [
                  { $gt: ["$reserved", "$available"] },
                  [{ type: "OVER_RESERVED", severity: "medium" }],
                  [],
                ],
              },
            ],
          },
        },
      },

      // ── 10. Shape the per-type document ───────────────────────────────────
      {
        $project: {
          _id: 0,
          materialTypeId: "$_id",
          name: "$type.name",
          pricePerDay: "$type.pricePerDay",
          categories: {
            $map: {
              input: "$categories",
              as: "cat",
              in: { categoryId: "$$cat._id", name: "$$cat.name" },
            },
          },
          totals: {
            totalInstances: "$totalInstances",
            available: "$available",
            reserved: "$reserved",
            loaned: "$loaned",
            inUse: "$inUse",
            returned: "$returned",
            maintenance: "$maintenance",
            damaged: "$damaged",
            lost: "$lost",
            retired: "$retired",
          },
          metrics: 1,
          alerts: 1,
        },
      },

      // ── 11. Group by primary category, paginate types ─────────────────────
      {
        $facet: {
          materialTypes: [
            { $sort: { name: 1 } },
            { $skip: skip },
            { $limit: limit },
          ],
          totalCount: [{ $count: "count" }],
          summaryStats: [
            {
              $group: {
                _id: null,
                totalMaterialTypes: { $sum: 1 },
                totalInstances: { $sum: "$totals.totalInstances" },
                totalAvailable: { $sum: "$totals.available" },
                totalLoaned: { $sum: "$totals.loaned" },
                totalInUse: { $sum: "$totals.inUse" },
                totalDamaged: { $sum: "$totals.damaged" },
                typesWithLowStock: {
                  $sum: {
                    $cond: [
                      {
                        $gt: [
                          {
                            $size: {
                              $filter: {
                                input: "$alerts",
                                cond: { $eq: ["$$this.type", "LOW_STOCK"] },
                              },
                            },
                          },
                          0,
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                typesWithHighDamage: {
                  $sum: {
                    $cond: [
                      {
                        $gt: [
                          {
                            $size: {
                              $filter: {
                                input: "$alerts",
                                cond: {
                                  $eq: ["$$this.type", "HIGH_DAMAGE_RATE"],
                                },
                              },
                            },
                          },
                          0,
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ];

    const [result] = await MaterialInstance.aggregate(pipeline);

    const stats = result.summaryStats[0] ?? {
      totalMaterialTypes: 0,
      totalInstances: 0,
      totalAvailable: 0,
      totalLoaned: 0,
      totalInUse: 0,
      totalDamaged: 0,
      typesWithLowStock: 0,
      typesWithHighDamage: 0,
    };

    const total = result.totalCount[0]?.count ?? 0;

    const summary = {
      totalMaterialTypes: stats.totalMaterialTypes,
      totalInstances: stats.totalInstances,
      globalAvailabilityRate:
        stats.totalInstances > 0
          ? +(stats.totalAvailable / stats.totalInstances).toFixed(4)
          : 0,
      globalUtilizationRate:
        stats.totalInstances > 0
          ? +(
              (stats.totalLoaned + stats.totalInUse) /
              stats.totalInstances
            ).toFixed(4)
          : 0,
      materialTypesWithLowStock: stats.typesWithLowStock,
      materialTypesWithHighDamage: stats.typesWithHighDamage,
    };

    return {
      summary,
      materialTypes: result.materialTypes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getInstance(
    id: string,
    organizationId?: Types.ObjectId | string,
    locationIds?: Types.ObjectId[],
  ) {
    const query: Record<string, unknown> = { _id: id };
    if (organizationId) query.organizationId = organizationId;
    if (locationIds && locationIds.length > 0) {
      query.locationId = { $in: locationIds };
    }

    const instance = await MaterialInstance.findOne(query).populate(
      "modelId",
      "name description pricePerDay categoryId",
    );

    if (!instance) {
      throw AppError.notFound("Instancia de material no encontrada");
    }

    const mappedInstance = renameProperty(instance, "modelId", "model") as {
      _id: Types.ObjectId | string;
      status: string;
      [key: string]: unknown;
    };

    mappedInstance.loanContext = organizationId
      ? await resolveMaterialInstanceLoanContext({
          organizationId,
          materialInstanceId: mappedInstance._id,
          instanceStatus: mappedInstance.status,
        })
      : EMPTY_LOAN_CONTEXT;

    return mappedInstance;
  },

  async createInstance(
    organizationId: Types.ObjectId | string,
    payload: Record<string, unknown>,
    locationIds?: Types.ObjectId[],
  ) {
    const writePayload = payload as MaterialInstanceWritePayload;

    if (!payload.modelId) {
      throw AppError.badRequest("Tipo de material (modelId) es requerido");
    }

    const materialType = await MaterialModel.findById(String(payload.modelId));
    if (!materialType) {
      throw AppError.notFound("Tipo de material no encontrado");
    }

    if (payload.locationId && locationIds && locationIds.length > 0) {
      const targetLocId = new Types.ObjectId(String(payload.locationId));
      if (!locationIds.some((lid) => lid.equals(targetLocId))) {
        throw AppError.forbidden("No tiene acceso a la ubicación especificada");
      }
    }

    if (payload.locationId) {
      const locationActive = await LocationService.locationExists(
        String(payload.locationId),
        String(organizationId),
        true,
      );
      if (!locationActive) {
        throw AppError.badRequest(
          "La ubicación de destino no se encontró o está inactiva",
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

    let payloadSerial = normalizeOptionalString(writePayload.serialNumber);
    const payloadBarcode = normalizeOptionalString(writePayload.barcode);

    // Auto-generate serialNumber if not provided and not using barcode as serial
    if (!payloadSerial && writePayload.useBarcodeAsSerial !== true) {
      payloadSerial = await codeGenerationService.generateCode({
        organizationId: String(organizationId),
        entityType: "material_instance",
        context: {
          materialTypeId: String(payload.modelId),
        },
      });
    }

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
        throw AppError.conflict(
          "El código de barras ya existe en esta organización",
        );
      }
      if (duplicateField === "serialNumber") {
        throw AppError.conflict(
          "Ya existe una instancia de material con ese número de serie en esta organización",
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
    locationIds?: Types.ObjectId[],
  ) {
    const writePayload = payload as MaterialInstanceWritePayload;

    const instance = await MaterialInstance.findOne({
      _id: id,
      organizationId,
    });

    if (!instance) {
      throw AppError.notFound("Instancia de material no encontrada");
    }

    if (locationIds && locationIds.length > 0) {
      const currentLocId = new Types.ObjectId(String(instance.locationId));
      if (!locationIds.some((lid) => lid.equals(currentLocId))) {
        throw AppError.notFound("Instancia de material no encontrada");
      }
      if (writePayload.locationId) {
        const newLocId = new Types.ObjectId(String(writePayload.locationId));
        if (!locationIds.some((lid) => lid.equals(newLocId))) {
          throw AppError.forbidden(
            "No tiene acceso a la ubicación especificada",
          );
        }
      }
    }

    if (writePayload.modelId) {
      const materialType = await MaterialModel.findById(
        String(writePayload.modelId),
      );
      if (!materialType) {
        throw AppError.notFound("Tipo de material no encontrado");
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
          "La ubicación de destino no se encontró o está inactiva",
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
      ...(writePayload.locationId
        ? { locationId: writePayload.locationId }
        : {}),
      ...(writePayload.notes !== undefined
        ? { notes: writePayload.notes }
        : {}),
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
        throw AppError.conflict(
          "El código de barras ya existe en esta organización",
        );
      }
      if (duplicateField === "serialNumber") {
        throw AppError.conflict(
          "Ya existe una instancia de material con ese número de serie en esta organización",
        );
      }
      throw err;
    }

    if (!updated) {
      throw AppError.notFound("Instancia de material no encontrada");
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
    locationIds?: Types.ObjectId[],
  ): Promise<{ instance: unknown; matchedBy: "barcode" | "serialNumber" }> {
    const orgFilter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(String(organizationId)),
      ...(locationIds && locationIds.length > 0
        ? { locationId: { $in: locationIds } }
        : {}),
    };

    let instance = await MaterialInstance.findOne({
      ...orgFilter,
      barcode: code,
    })
      .populate("modelId", "name description pricePerDay categoryId")
      .populate("locationId", "name");

    if (instance) {
      return {
        instance: renameProperty(instance, "modelId", "model"),
        matchedBy: "barcode",
      };
    }

    instance = await MaterialInstance.findOne({
      ...orgFilter,
      serialNumber: code,
    })
      .populate("modelId", "name description pricePerDay categoryId")
      .populate("locationId", "name");

    if (instance) {
      return {
        instance: renameProperty(instance, "modelId", "model"),
        matchedBy: "serialNumber",
      };
    }

    throw AppError.notFound(
      "No se encontró instancia de material para el código escaneado",
    );
  },

  async updateInstanceStatus(
    organizationId: Types.ObjectId | string,
    id: string,
    status: string,
    notes?: string,
    actorUserId?: Types.ObjectId | string,
    source: "manual" | "scanner" | "system" = "manual",
    locationIds?: Types.ObjectId[],
  ) {
    const instance = await MaterialInstance.findOne({
      _id: id,
      organizationId,
    });
    if (!instance) {
      throw AppError.notFound("Instancia de material no encontrada");
    }

    if (locationIds && locationIds.length > 0) {
      const locId = new Types.ObjectId(String(instance.locationId));
      if (!locationIds.some((lid) => lid.equals(locId))) {
        throw AppError.notFound("Instancia de material no encontrada");
      }
    }

    const currentStatus = instance.status;

    // Idempotent: same status requested → return success without recording movement
    if (currentStatus === status) {
      return renameProperty(instance, "modelId", "model");
    }

    const allowedTransitions = (MATERIAL_TRANSITIONS[currentStatus] ??
      []) as readonly string[];

    if (!allowedTransitions.includes(status)) {
      throw AppError.badRequest(
        `Transición de estado inválida de '${currentStatus}' a '${status}'`,
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

  async deleteInstance(
    organizationId: Types.ObjectId | string,
    id: string,
    locationIds?: Types.ObjectId[],
  ) {
    const instance = await MaterialInstance.findOne({
      _id: id,
      organizationId,
    });

    if (!instance) {
      throw AppError.notFound("Instancia de material no encontrada");
    }

    if (locationIds && locationIds.length > 0) {
      const locId = new Types.ObjectId(String(instance.locationId));
      if (!locationIds.some((lid) => lid.equals(locId))) {
        throw AppError.notFound("Instancia de material no encontrada");
      }
    }

    if (!["available", "retired"].includes(instance.status)) {
      throw AppError.badRequest(
        "Solo se pueden eliminar instancias de material disponibles o retiradas",
      );
    }

    await MaterialInstance.deleteOne({ _id: id });

    await LocationService.recalculateMaterialCapacitiesCurrentQuantity({
      organizationId,
      locationIds: [instance.locationId],
    });

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
      throw AppError.notFound("Atributo de material no encontrado");
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
          "Ya existe un atributo con ese nombre en esta organización",
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
      throw AppError.notFound("Atributo de material no encontrado");
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
          "No se pueden restringir los valores permitidos: uno o más tipos de material tienen valores " +
            "que no están en la nueva lista de valores permitidos. Actualiza esos tipos de material primero.",
          { code: "ALLOWED_VALUES_IN_USE" },
        );
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
          "Ya existe un atributo con ese nombre en esta organización",
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
      throw AppError.notFound("Atributo de material no encontrado");
    }

    const usageCount = await MaterialModel.countDocuments({
      organizationId,
      "attributes.attributeId": attribute._id,
    });

    if (usageCount > 0) {
      throw AppError.conflict(
        `No se puede eliminar el atributo '${attribute.name}': es utilizado por ${usageCount} tipo(s) de material. ` +
          "Elimina el atributo de esos tipos de material primero.",
      );
    }

    await MaterialAttribute.deleteOne({ _id: id });
  },

  /**
   * Audit endpoint: Find all material types with orphaned allowedValues
   * (i.e., attributes with values not in the attribute's current allowedValues array)
   */
  async auditOrphanedAttributeValues(organizationId: Types.ObjectId | string) {
    const orphanedMaterials: Array<{
      materialTypeId: string;
      materialTypeName: string;
      attributeId: string;
      attributeName: string;
      orphanedValues: string[];
      allowedValues: string[];
    }> = [];

    // Get all attributes with allowedValues restrictions
    const attributes = await MaterialAttribute.find({
      organizationId,
      allowedValues: { $exists: true, $ne: [] },
    });

    for (const attr of attributes) {
      const allowedSet = new Set(attr.allowedValues);

      // Find materials using this attribute with values not in allowedValues
      const violatingMaterials = await MaterialModel.find({
        organizationId,
        "attributes.attributeId": attr._id,
        "attributes.value": { $nin: attr.allowedValues },
      });

      for (const material of violatingMaterials) {
        const attrEntry = material.attributes.find(
          (a) => String(a.attributeId) === String(attr._id),
        );
        if (attrEntry && !allowedSet.has(attrEntry.value)) {
          orphanedMaterials.push({
            materialTypeId: String(material._id),
            materialTypeName: material.name,
            attributeId: String(attr._id),
            attributeName: attr.name,
            orphanedValues: [attrEntry.value],
            allowedValues: attr.allowedValues,
          });
        }
      }
    }

    return orphanedMaterials;
  },

  /**
   * Audit endpoint: Check cascade impact when deleting an attribute
   * Returns the count and list of material types that would be affected
   */
  async getAttributeDeletionImpact(
    organizationId: Types.ObjectId | string,
    attributeId: string,
  ) {
    const attribute = await MaterialAttribute.findOne({
      _id: attributeId,
      organizationId,
    });
    if (!attribute) {
      throw AppError.notFound("Atributo de material no encontrado");
    }

    const affectedMaterials = await MaterialModel.find({
      organizationId,
      "attributes.attributeId": attributeId,
    }).select("_id name attributes");

    const impact = affectedMaterials.map((material) => {
      const attrCount = material.attributes.length;
      const isRequired =
        material.attributes.find((a) => String(a.attributeId) === attributeId)
          ?.isRequired ?? false;

      return {
        materialTypeId: String(material._id),
        materialTypeName: material.name,
        totalAttributes: attrCount,
        isRequired,
      };
    });

    return {
      attributeId,
      attributeName: attribute.name,
      affectedMaterialCount: impact.length,
      affectedMaterials: impact,
    };
  },
};

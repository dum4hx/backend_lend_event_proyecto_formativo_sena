import type { Types } from "mongoose";
import { Category } from "./models/category.model.ts";
import { MaterialModel } from "./models/material_type.model.ts";
import { MaterialAttribute } from "./models/material_attribute.model.ts";
import { MaterialInstance } from "./models/material_instance.model.ts";
import { LocationService } from "../location/location.service.ts";
import { AppError } from "../../errors/AppError.ts";
import { logger } from "../../utils/logger.ts";
import { renameProperty } from "../../utils/renameProperty.ts";
import { organizationService } from "../organization/organization.service.ts";

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

    const [materialTypes, total] = await Promise.all([
      MaterialModel.find(query)
        .skip(skip)
        .limit(Number(limit))
        .populate("categoryId", "name")
        .sort({ name: 1 }),
      MaterialModel.countDocuments(query),
    ]);

    return {
      materialTypes,
      total,
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
  }) {
    const {
      page = 1,
      limit = 20,
      status,
      materialTypeId,
      search,
      organizationId,
    } = opts;
    const skip = (Number(page) - 1) * Number(limit);

    const query: Record<string, unknown> = {};
    if (organizationId) query.organizationId = organizationId;

    if (status) {
      query.status = status;
    }

    if (materialTypeId) {
      query.modelId = materialTypeId;
    }

    if (search) {
      query.serialNumber = { $regex: search, $options: "i" };
    }

    const [instancesDocs, total] = await Promise.all([
      MaterialInstance.find(query)
        .skip(skip)
        .limit(Number(limit))
        .populate("modelId", "name pricePerDay")
        .sort({ createdAt: -1 }),
      MaterialInstance.countDocuments(query),
    ]);

    const instances = renameProperty(instancesDocs, "modelId", "model");

    return {
      instances,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
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
    }

    const toCreate = { ...payload, organizationId } as Record<string, unknown>;
    const instance = await MaterialInstance.create(toCreate);
    // Populate the model field before returning
    await instance.populate(
      "modelId",
      "name description pricePerDay categoryId",
    );
    return renameProperty(instance, "modelId", "model");
  },

  async updateInstanceStatus(
    organizationId: Types.ObjectId | string,
    id: string,
    status: string,
    notes?: string,
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

import type { Types } from "mongoose";
import { Category } from "./models/category.model.ts";
import { MaterialModel } from "./models/material_type.model.ts";
import { MaterialInstance } from "./models/material_instance.model.ts";
import { LocationService } from "../location/location.service.ts";
import { AppError } from "../../errors/AppError.ts";
import { logger } from "../../utils/logger.ts";
import { organizationService } from "../organization/organization.service.ts";

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
      if (payload.categoryId) {
        const category = await Category.findById(String(payload.categoryId));
        if (
          !category ||
          category.organizationId.toString() !== organizationId.toString()
        ) {
          throw AppError.notFound("Category not found");
        }
      }

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

    const [instances, total] = await Promise.all([
      MaterialInstance.find(query)
        .skip(skip)
        .limit(Number(limit))
        .populate("modelId", "name pricePerDay")
        .sort({ createdAt: -1 }),
      MaterialInstance.countDocuments(query),
    ]);

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

    return instance;
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
    return instance;
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

    return instance;
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
};

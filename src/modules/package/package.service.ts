import type { Types } from "mongoose";
import { Package } from "./models/package.model.ts";
import type { PackageInput } from "./models/package.model.ts";
import { MaterialModel } from "../material/models/material_type.model.ts";
import { AppError } from "../../errors/AppError.ts";

export const packageService = {
  async listPackages(
    opts: {
      page?: number | string | undefined;
      limit?: number | string | undefined;
      isActive?: boolean | undefined;
      search?: string | undefined;
    },
    organizationId: Types.ObjectId | string,
  ) {
    const { page = 1, limit = 20, isActive, search } = opts;
    const skip = (Number(page) - 1) * Number(limit);

    const query: Record<string, unknown> = { organizationId };

    if (typeof isActive === "boolean") {
      query.isActive = isActive;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const [packages, total] = await Promise.all([
      Package.find(query)
        .skip(Number(skip))
        .limit(Number(limit))
        .populate("items.materialTypeId", "name pricePerDay")
        .sort({ createdAt: -1 }),
      Package.countDocuments(query),
    ]);

    return {
      packages,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    };
  },

  async getPackage(id: string, organizationId: Types.ObjectId | string) {
    const pkg = await Package.findOne({ _id: id, organizationId }).populate(
      "items.materialTypeId",
      "name description pricePerDay categoryId",
    );

    if (!pkg) {
      throw AppError.notFound("Package not found");
    }

    return pkg;
  },

  async createPackage(
    organizationId: Types.ObjectId | string,
    payload: PackageInput,
  ) {
    // Validate that all material types exist and belong to org
    const materialTypeIds = (
      (payload.items as Array<{ materialTypeId: string }>) ?? []
    ).map((mt) => mt.materialTypeId);

    if (materialTypeIds.length > 0) {
      const existingTypes = await MaterialModel.find({
        _id: { $in: materialTypeIds },
        organizationId,
      });

      if (existingTypes.length !== materialTypeIds.length) {
        throw AppError.badRequest("One or more material types not found");
      }
    }

    // Check duplicate name within org
    const existing = await Package.findOne({
      organizationId,
      name: payload.name,
    });
    if (existing) {
      throw AppError.conflict("A package with this name already exists");
    }

    const pkg = await Package.create({
      ...payload,
      organizationId,
    } as Parameters<typeof Package.create>[0]);
    return pkg;
  },

  async updatePackage(
    organizationId: Types.ObjectId | string,
    id: string,
    updates: Partial<PackageInput> | Record<string, unknown>,
  ) {
    // If items present, validate
    const updatesRecord = updates as Record<string, unknown>;
    if (updatesRecord.items) {
      const materialTypeIds = (
        (updatesRecord.items as Array<{ materialTypeId: string }>) ?? []
      ).map((mt) => mt.materialTypeId);

      if (materialTypeIds.length > 0) {
        const existingTypes = await MaterialModel.find({
          _id: { $in: materialTypeIds },
          organizationId,
        });

        if (existingTypes.length !== materialTypeIds.length) {
          throw AppError.badRequest("One or more material types not found");
        }
      }
    }

    const pkg = await Package.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!pkg) {
      throw AppError.notFound("Package not found");
    }

    return pkg;
  },

  async activatePackage(organizationId: Types.ObjectId | string, id: string) {
    const pkg = await Package.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: { isActive: true } },
      { new: true },
    );

    if (!pkg) throw AppError.notFound("Package not found");
    return pkg;
  },

  async deactivatePackage(organizationId: Types.ObjectId | string, id: string) {
    const pkg = await Package.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: { isActive: false } },
      { new: true },
    );

    if (!pkg) throw AppError.notFound("Package not found");
    return pkg;
  },

  async deletePackage(organizationId: Types.ObjectId | string, id: string) {
    // Check active requests referencing this package
    const { LoanRequest } = await import("../request/models/request.model.ts");
    const activeRequests = await LoanRequest.countDocuments({
      packageId: id,
      status: { $in: ["pending", "approved", "assigned", "ready"] },
    });

    if (activeRequests > 0) {
      throw AppError.badRequest("Cannot delete package with active requests");
    }

    const pkg = await Package.findOneAndDelete({ _id: id, organizationId });
    if (!pkg) throw AppError.notFound("Package not found");

    return;
  },
};

export default packageService;

import { Types } from "mongoose";
import { Package } from "./models/package.model.ts";
import type { PackageInput } from "./models/package.model.ts";
import { MaterialModel } from "../material/models/material_type.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { Loan } from "../loan/models/loan.model.ts";
import { LoanRequest } from "../request/models/request.model.ts";
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
      throw AppError.notFound("Paquete no encontrado");
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
        throw AppError.badRequest("Uno o más tipos de material no encontrados");
      }
    }

    // Check duplicate name within org
    const existing = await Package.findOne({
      organizationId,
      name: payload.name,
    });
    if (existing) {
      throw AppError.conflict("Ya existe un paquete con este nombre");
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
          throw AppError.badRequest("Uno o más tipos de material no encontrados");
        }
      }
    }

    const pkg = await Package.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!pkg) {
      throw AppError.notFound("Paquete no encontrado");
    }

    return pkg;
  },

  async activatePackage(organizationId: Types.ObjectId | string, id: string) {
    const pkg = await Package.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: { isActive: true } },
      { new: true },
    );

    if (!pkg) throw AppError.notFound("Paquete no encontrado");
    return pkg;
  },

  async deactivatePackage(organizationId: Types.ObjectId | string, id: string) {
    const pkg = await Package.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: { isActive: false } },
      { new: true },
    );

    if (!pkg) throw AppError.notFound("Paquete no encontrado");
    return pkg;
  },

  /**
   * Returns availability information for a package: for each material type in
   * the package, lists available instances grouped by location, considering
   * blocking loans and requests during the given date range.
   */
  async getPackageAvailability(
    organizationId: Types.ObjectId | string,
    packageId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const pkg = await Package.findOne({ _id: packageId, organizationId })
      .populate("items.materialTypeId", "name pricePerDay")
      .lean();

    if (!pkg) throw AppError.notFound("Paquete no encontrado");

    const materialTypeIds = pkg.items.map(
      (item) => new Types.ObjectId(String(item.materialTypeId._id ?? item.materialTypeId)),
    );

    // Fetch all candidate instances (available, reserved, or loaned)
    const instances = await MaterialInstance.find({
      organizationId,
      modelId: { $in: materialTypeIds },
      status: { $in: ["available", "reserved", "loaned"] },
    })
      .populate("locationId", "name")
      .lean();

    // Find instances busy during the requested date range
    const instanceIds = instances.map((i) => i._id);
    const busyInstanceIds = new Set<string>();

    if (instanceIds.length > 0) {
      const [blockingLoans, blockingRequests] = await Promise.all([
        Loan.find({
          organizationId,
          "materialInstances.materialInstanceId": { $in: instanceIds },
          status: { $in: ["active", "overdue"] },
          startDate: { $lt: endDate },
          endDate: { $gt: startDate },
        }).lean(),
        LoanRequest.find({
          organizationId,
          status: { $in: ["approved", "assigned", "ready", "shipped"] },
          "assignedMaterials.materialInstanceId": { $in: instanceIds },
          startDate: { $lt: endDate },
          endDate: { $gt: startDate },
        }).lean(),
      ]);

      for (const loan of blockingLoans) {
        for (const mi of loan.materialInstances) {
          busyInstanceIds.add(String(mi.materialInstanceId));
        }
      }
      for (const req of blockingRequests) {
        for (const am of req.assignedMaterials ?? []) {
          busyInstanceIds.add(String(am.materialInstanceId));
        }
      }
    }

    // Build per-item availability
    const itemAvailability = pkg.items.map((item) => {
      const typeId = String(item.materialTypeId._id ?? item.materialTypeId);
      const typeName = (item.materialTypeId as any).name ?? typeId;
      const requiredQty = item.quantity;

      const matchingInstances = instances.filter(
        (inst) => String(inst.modelId) === typeId,
      );

      const availableInstances = matchingInstances.filter(
        (inst) => !busyInstanceIds.has(String(inst._id)),
      );

      // Group by location
      const byLocation = new Map<
        string,
        { locationId: string; locationName: string; count: number; instances: any[] }
      >();

      for (const inst of availableInstances) {
        const locId = String(inst.locationId._id ?? inst.locationId);
        const locName = (inst.locationId as any).name ?? locId;
        const entry = byLocation.get(locId) ?? {
          locationId: locId,
          locationName: locName,
          count: 0,
          instances: [],
        };
        entry.count += 1;
        (entry.instances as Record<string, unknown>[]).push({
          instanceId: String(inst._id),
          serialNumber: inst.serialNumber,
          barcode: (inst as any).barcode ?? null,
          status: inst.status,
        });
        byLocation.set(locId, entry);
      }

      return {
        materialTypeId: typeId,
        materialTypeName: typeName,
        requiredQuantity: requiredQty,
        totalAvailable: availableInstances.length,
        isSatisfied: availableInstances.length >= requiredQty,
        locations: Array.from(byLocation.values()),
      };
    });

    const allSatisfied = itemAvailability.every((item) => item.isSatisfied);

    return {
      packageId: String(pkg._id),
      packageName: pkg.name,
      startDate,
      endDate,
      canFulfill: allSatisfied,
      items: itemAvailability,
    };
  },

  async deletePackage(organizationId: Types.ObjectId | string, id: string) {
    // Check active requests referencing this package
    const { LoanRequest } = await import("../request/models/request.model.ts");
    const activeRequests = await LoanRequest.countDocuments({
      packageId: id,
      status: { $in: ["pending", "approved", "assigned", "ready"] },
    });

    if (activeRequests > 0) {
      throw AppError.badRequest("No se puede eliminar un paquete con solicitudes activas");
    }

    const pkg = await Package.findOneAndDelete({ _id: id, organizationId });
    if (!pkg) throw AppError.notFound("Paquete no encontrado");

    return;
  },
};

export default packageService;

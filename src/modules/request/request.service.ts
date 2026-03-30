import { Types } from "mongoose";
import {
  LoanRequest,
  type LoanRequestDocument,
  requestStatusOptions,
} from "./models/request.model.ts";
import { Package } from "../package/models/package.model.ts";
import { MaterialModel } from "../material/models/material_type.model.ts";
import { Customer } from "../customer/models/customer.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { Loan } from "../loan/models/loan.model.ts";
import { User } from "../user/models/user.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { logger } from "../../utils/logger.ts";
import { pricingService } from "../pricing/pricing.service.ts";

interface RequestItemInput {
  type?: string;
  referenceId?: string;
  materialTypeId?: string;
  packageId?: string;
  quantity: number;
}

interface NormalizedRequestItem {
  type: "material" | "package";
  referenceId: string;
  quantity: number;
}

interface CreateRequestInput {
  customerId: string;
  startDate: Date;
  endDate: Date;
  notes?: string;
  depositAmount: number;
  items: RequestItemInput[];
}

interface ListRequestsQuery {
  page?: number;
  limit?: number;
  status?: string;
  customerId?: string;
  packageId?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/* ---------- Internal Helpers ---------- */

function normalizeRequestItem(
  item: RequestItemInput,
  itemIndex: number,
): NormalizedRequestItem {
  const fallbackType = item.materialTypeId
    ? "material"
    : item.packageId
      ? "package"
      : undefined;

  const resolvedType = item.type ?? fallbackType;

  if (resolvedType !== "material" && resolvedType !== "package") {
    throw AppError.badRequest(`Invalid type for item at index ${itemIndex}`);
  }

  const resolvedReferenceId =
    item.referenceId ??
    (resolvedType === "material" ? item.materialTypeId : item.packageId);

  if (!resolvedReferenceId || !Types.ObjectId.isValid(resolvedReferenceId)) {
    throw AppError.badRequest(
      `Invalid referenceId for ${resolvedType} item at index ${itemIndex}`,
    );
  }

  return {
    type: resolvedType,
    referenceId: resolvedReferenceId,
    quantity: item.quantity,
  };
}

/* ---------- Request Service ---------- */

export const requestService = {
  /**
   * Lists all loan requests in the organization.
   */
  async listRequests(
    organizationId: string | Types.ObjectId,
    query: ListRequestsQuery,
  ): Promise<{
    requests: LoanRequestDocument[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      status,
      customerId,
      packageId,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    const skip = (page - 1) * limit;
    const filter: Record<string, any> = { organizationId };

    if (status) {
      filter.status = status;
    }
    if (customerId) {
      filter.customerId = customerId;
    }
    if (packageId) {
      filter.items = {
        $elemMatch: {
          type: "package",
          referenceId: new Types.ObjectId(packageId),
        },
      };
    }

    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const [requests, total] = await Promise.all([
      LoanRequest.find(filter)
        .skip(skip)
        .limit(limit)
        .populate("customerId", "email name")
        .populate("assignedMaterials.materialInstanceId", "serialNumber")
        .sort({ [sortBy]: sortDirection }),
      LoanRequest.countDocuments(filter),
    ]);

    return {
      requests: requests as unknown as LoanRequestDocument[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Gets a specific request by ID.
   */
  async getRequestById(
    requestId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
  ): Promise<LoanRequestDocument> {
    const request = await LoanRequest.findOne({
      _id: requestId,
      organizationId,
    })
      .populate("customerId", "email name phone address")
      .populate(
        "assignedMaterials.materialInstanceId",
        "serialNumber status modelId",
      );

    if (!request) {
      throw AppError.notFound("Request not found");
    }

    return request as unknown as LoanRequestDocument;
  },

  /**
   * Creates a new loan request.
   */
  async createRequest(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    data: CreateRequestInput,
  ): Promise<LoanRequestDocument> {
    // Validate customer exists and is active
    const customer = await Customer.findOne({
      _id: data.customerId,
      organizationId,
      status: "active",
    });

    if (!customer) {
      throw AppError.notFound("Customer not found or inactive");
    }

    const normalizedItems = data.items.map((item, index) =>
      normalizeRequestItem(item, index),
    );

    // Resolve each item reference
    for (const [itemIndex, item] of normalizedItems.entries()) {
      if (item.type === "material") {
        const material = await MaterialModel.findOne({
          _id: item.referenceId,
          organizationId,
        });

        if (!material) {
          throw AppError.notFound(
            `Material not found or inactive for item at index ${itemIndex}`,
          );
        }
        continue;
      }

      const pkg = await Package.findOne({
        _id: item.referenceId,
        organizationId,
        $or: [{ status: "active" }, { isActive: true }],
      });

      if (!pkg) {
        throw AppError.notFound(
          `Package not found or inactive for item at index ${itemIndex}`,
        );
      }
    }

    // Check date validity
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (startDate < today) {
      throw AppError.badRequest("Start date cannot be in the past");
    }

    if (endDate <= startDate) {
      throw AppError.badRequest("End date must be after start date");
    }

    const request = await LoanRequest.create({
      ...data,
      items: normalizedItems,
      organizationId,
      createdBy: userId,
      status: "pending",
    });

    const populatedRequest = await LoanRequest.findById(request._id).populate(
      "customerId",
      "email name",
    );

    logger.info("Loan request created", {
      requestId: request._id.toString(),
      organizationId: organizationId.toString(),
      createdBy: userId.toString(),
    });

    return populatedRequest as unknown as LoanRequestDocument;
  },

  /**
   * Approves a pending request.
   */
  async approveRequest(
    requestId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    notes?: string,
  ): Promise<LoanRequestDocument> {
    const request = await LoanRequest.findOne({
      _id: requestId,
      organizationId,
      status: "pending",
    });

    if (!request) {
      throw AppError.notFound("Request not found or not in pending status");
    }

    request.status = "approved";
    request.approvedBy = new Types.ObjectId(userId);
    request.approvedAt = new Date();

    if (notes) {
      request.notes = (request.notes ?? "") + `\nApproval notes: ${notes}`;
    }

    await pricingService.calculateRequestPricing(request);

    await request.save();

    logger.info("Loan request approved", {
      requestId: request._id.toString(),
      approvedBy: userId.toString(),
    });

    return request as unknown as LoanRequestDocument;
  },

  /**
   * Rejects a pending request.
   */
  async rejectRequest(
    requestId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
    reason: string,
  ): Promise<LoanRequestDocument> {
    const request = await LoanRequest.findOne({
      _id: requestId,
      organizationId,
      status: "pending",
    });

    if (!request) {
      throw AppError.notFound("Request not found or not in pending status");
    }

    request.status = "rejected";
    request.rejectionReason = reason;
    await request.save();

    logger.info("Loan request rejected", {
      requestId: request._id.toString(),
    });

    return request as unknown as LoanRequestDocument;
  },

  /**
   * Assigns specific material instances to an approved request.
   */
  async assignMaterials(
    requestId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
    assignments: { materialTypeId: string; materialInstanceId: string }[],
  ): Promise<LoanRequestDocument> {
    const request = await LoanRequest.findOne({
      _id: requestId,
      organizationId,
      status: "approved",
    });

    if (!request) {
      throw AppError.notFound("Request not found or not in approved status");
    }

    // Validate all material instances are available
    const instanceIds = assignments.map((a) => a.materialInstanceId);
    const instances = await MaterialInstance.find({
      _id: { $in: instanceIds },
      status: "available",
      organizationId, // Ensure they belong to the same org
    });

    if (instances.length !== instanceIds.length) {
      throw AppError.badRequest(
        "One or more material instances are not available",
      );
    }

    // Update instance statuses to reserved
    await MaterialInstance.updateMany(
      { _id: { $in: instanceIds } },
      { $set: { status: "reserved" } },
    );

    // Set assigned materials on request
    request.assignedMaterials = assignments.map((a, index) => ({
      materialInstanceId: new Types.ObjectId(a.materialInstanceId),
      itemIndex: index, // Since we don't have a direct link yet, we use index
    })) as any;

    request.status = "assigned";
    await request.save();

    logger.info("Materials assigned to request", {
      requestId: request._id.toString(),
      instanceCount: instanceIds.length,
    });

    return request as unknown as LoanRequestDocument;
  },

  /**
   * Marks a request as ready for pickup.
   */
  async markAsReady(
    requestId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
  ): Promise<LoanRequestDocument> {
    const request = await LoanRequest.findOne({
      _id: requestId,
      organizationId,
      status: "assigned",
    });

    if (!request) {
      throw AppError.notFound("Request not found or not in assigned status");
    }

    if (!request.assignedMaterials || request.assignedMaterials.length === 0) {
      throw AppError.badRequest("No materials assigned to this request");
    }

    request.status = "ready";
    await request.save();

    logger.info("Request marked as ready for pickup", {
      requestId: request._id.toString(),
    });

    return request as unknown as LoanRequestDocument;
  },

  /**
   * Records that the deposit for a request has been paid.
   * For manual payment confirmation (cash, bank transfer, etc.).
   * Only allowed when the request is in a pre-checkout status and
   * has a deposit amount greater than zero.
   */
  async recordDepositPayment(
    requestId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
  ): Promise<LoanRequestDocument> {
    const request = await LoanRequest.findOne({
      _id: requestId,
      organizationId,
      status: { $in: ["approved", "deposit_pending", "assigned", "ready"] },
    });

    if (!request) {
      throw AppError.notFound("Request not found or not in a payable status");
    }

    if ((request.depositAmount ?? 0) === 0) {
      throw AppError.badRequest(
        "This request has no deposit amount; payment recording is not required",
      );
    }

    if (request.depositPaidAt) {
      throw AppError.conflict("Deposit has already been recorded as paid");
    }

    request.depositPaidAt = new Date();
    await request.save();

    logger.info("Deposit payment recorded for request", {
      requestId: request._id.toString(),
    });

    return request as unknown as LoanRequestDocument;
  },

  /**
   * Cancels a request and releases any reserved materials.
   */
  async cancelRequest(
    requestId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
  ): Promise<LoanRequestDocument> {
    const request = await LoanRequest.findOne({
      _id: requestId,
      organizationId,
      status: { $in: ["pending", "approved", "assigned", "ready"] },
    });

    if (!request) {
      throw AppError.notFound("Request not found or cannot be cancelled");
    }

    // If materials were assigned, release them
    if (request.assignedMaterials && request.assignedMaterials.length > 0) {
      const instanceIds = request.assignedMaterials.map(
        (am) => am.materialInstanceId,
      );
      await MaterialInstance.updateMany(
        { _id: { $in: instanceIds } },
        { $set: { status: "available" } },
      );
    }

    request.status = "cancelled";
    await request.save();

    logger.info("Request cancelled", {
      requestId: request._id.toString(),
    });

    return request as unknown as LoanRequestDocument;
  },

  /**
   * Returns material instances that could fulfil a request's needs,
   * classified by current availability and split by user-accessible locations.
   *
   * Availability categories per instance:
   * - "available"  – status is currently "available" (can be assigned now)
   * - "upcoming"   – status is "reserved" or "loaned" but the holding
   *                   loan/request ends before this request's startDate
   * - excluded     – instances that are damaged/maintenance/retired/lost
   *                   or won't be free in time are omitted
   */
  async getAvailableMaterials(
    requestId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ) {
    // 1. Load the request
    const request = await LoanRequest.findOne({
      _id: requestId,
      organizationId,
    });

    if (!request) {
      throw AppError.notFound("Request not found");
    }

    // 2. Collect required material type IDs (resolve packages into their item types)
    const materialTypeIds: Types.ObjectId[] = [];

    for (const item of request.items) {
      if (item.type === "material") {
        materialTypeIds.push(new Types.ObjectId(item.referenceId));
      } else if (item.type === "package") {
        const pkg = await Package.findById(item.referenceId).lean();
        if (pkg?.items) {
          for (const pkgItem of pkg.items) {
            materialTypeIds.push(new Types.ObjectId(pkgItem.materialTypeId));
          }
        }
      }
    }

    if (materialTypeIds.length === 0) {
      return { currentUserLocations: [], otherLocations: [] };
    }

    // Deduplicate
    const uniqueTypeIds = [
      ...new Set(materialTypeIds.map((id) => id.toString())),
    ].map((id) => new Types.ObjectId(id));

    // 3. Fetch all non-retired/non-lost instances of needed types
    const candidateStatuses = ["available", "reserved", "loaned"];
    const instances = await MaterialInstance.find({
      organizationId,
      modelId: { $in: uniqueTypeIds },
      status: { $in: candidateStatuses },
    }).lean();

    if (instances.length === 0) {
      return { currentUserLocations: [], otherLocations: [] };
    }

    // 4. For reserved/loaned instances, check whether they'll be free before startDate
    const reservedOrLoaned = instances.filter(
      (i) => i.status === "reserved" || i.status === "loaned",
    );

    const busyInstanceIds = new Set<string>();

    if (reservedOrLoaned.length > 0) {
      const instanceIdsToCheck = reservedOrLoaned.map((i) =>
        new Types.ObjectId(i._id).toString(),
      );

      // Check active loans whose endDate overlaps the request startDate
      const blockingLoans = await Loan.find({
        organizationId,
        "materialInstances.materialInstanceId": {
          $in: instanceIdsToCheck.map((id) => new Types.ObjectId(id)),
        },
        status: { $in: ["active", "overdue"] },
        endDate: { $gte: request.startDate },
      }).lean();

      for (const loan of blockingLoans) {
        for (const mi of loan.materialInstances) {
          busyInstanceIds.add(
            new Types.ObjectId(mi.materialInstanceId).toString(),
          );
        }
      }

      // Check requests (approved/assigned/ready) whose endDate overlaps
      const blockingRequests = await LoanRequest.find({
        organizationId,
        _id: { $ne: new Types.ObjectId(String(requestId)) },
        status: { $in: ["approved", "assigned", "ready"] },
        "assignedMaterials.materialInstanceId": {
          $in: instanceIdsToCheck.map((id) => new Types.ObjectId(id)),
        },
        endDate: { $gte: request.startDate },
      }).lean();

      for (const req of blockingRequests) {
        for (const am of req.assignedMaterials ?? []) {
          busyInstanceIds.add(
            new Types.ObjectId(am.materialInstanceId).toString(),
          );
        }
      }
    }

    // 5. Classify each instance
    type AvailabilityTag = "available" | "upcoming";
    const classifiedIds: { id: string; availability: AvailabilityTag }[] = [];

    for (const instance of instances) {
      const instanceId = new Types.ObjectId(instance._id).toString();

      if (instance.status === "available") {
        classifiedIds.push({ id: instanceId, availability: "available" });
      } else {
        // reserved or loaned
        if (!busyInstanceIds.has(instanceId)) {
          classifiedIds.push({ id: instanceId, availability: "upcoming" });
        }
        // else: won't be free in time → excluded
      }
    }

    if (classifiedIds.length === 0) {
      return { currentUserLocations: [], otherLocations: [] };
    }

    // 6. Resolve user locations for the split
    const user = await User.findById(userId).select("locations").lean();
    const userLocationIds: Types.ObjectId[] = (user?.locations ?? []).map(
      (id) => new Types.ObjectId(String(id)),
    );

    // 7. Aggregation pipeline: enrich and split by user locations
    const availabilityMap = new Map(
      classifiedIds.map((c) => [c.id, c.availability]),
    );
    const qualifiedIds = classifiedIds.map((c) => new Types.ObjectId(c.id));

    const pipeline = [
      { $match: { _id: { $in: qualifiedIds } } },
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

    // 8. Inject the availability tag into each instance
    const injectAvailability = (
      groups: Array<{ location: any; instances: any[] }>,
    ) =>
      groups.map((group) => ({
        ...group,
        instances: group.instances.map((inst) => ({
          ...inst,
          availability: availabilityMap.get(
            new Types.ObjectId(inst._id).toString(),
          ),
        })),
      }));

    return {
      currentUserLocations: injectAvailability(result.currentUserLocations),
      otherLocations: injectAvailability(result.otherLocations),
    };
  },
};

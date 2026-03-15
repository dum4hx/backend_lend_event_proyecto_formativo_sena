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
import { AppError } from "../../errors/AppError.ts";
import { logger } from "../../utils/logger.ts";

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
};

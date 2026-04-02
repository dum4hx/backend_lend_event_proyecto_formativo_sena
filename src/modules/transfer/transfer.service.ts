import { AppError } from "../../errors/AppError.ts";
import { Transfer, type TransferInput } from "./models/transfer.model.ts";
import {
  TransferRequest,
  type TransferRequestInput,
} from "./models/transfer_request.model.ts";
import {
  TransferRejectionReason,
  type TransferRejectionReasonInput,
} from "./models/transfer_rejection_reason.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { Location } from "../location/models/location.model.ts";
import { User } from "../user/models/user.model.ts";
import { Types, startSession, type ClientSession } from "mongoose";

class TransferService {
  /**
   * Create a new transfer request
   */
  async createRequest(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    payload: TransferRequestInput,
  ) {
    // Check if locations exist and belong to the org
    const [fromLocation, toLocation] = await Promise.all([
      Location.findOne({
        _id: payload.fromLocationId,
        organizationId,
        isActive: true,
      }),
      Location.findOne({
        _id: payload.toLocationId,
        organizationId,
        isActive: true,
      }),
    ]);

    if (!fromLocation)
      throw AppError.notFound("Origin location not found or inactive");
    if (!toLocation)
      throw AppError.notFound("Destination location not found or inactive");

    if (payload.fromLocationId === payload.toLocationId) {
      throw AppError.badRequest(
        "Origin and destination locations must be different",
      );
    }

    const request = await TransferRequest.create({
      fromLocationId: payload.fromLocationId,
      toLocationId: payload.toLocationId,
      organizationId,
      requestedBy: userId,
      status: "requested" as const,
      items: payload.items,
      ...(payload.notes !== undefined && { notes: payload.notes }),
      ...(payload.neededBy !== undefined && {
        neededBy: new Date(payload.neededBy),
      }),
    });

    return request;
  }

  /**
   * Respond to a transfer request (Approve/Reject/Cancel)
   * Only users assigned to the source location can respond to the request
   */
  async respondToRequest(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    requestId: string | Types.ObjectId,
    status: "approved" | "rejected",
    rejectionReasonId?: string,
    rejectionNote?: string,
  ) {
    const request = await TransferRequest.findOne({
      _id: requestId,
      organizationId,
    });
    if (!request) throw AppError.notFound("Transfer request not found");

    // Validate that user is assigned to the source location
    const user = await User.findOne({ _id: userId, organizationId });
    if (!user) throw AppError.notFound("User not found");

    const userHasAccessToSourceLocation = user.locations?.some(
      (locId) => locId.toString() === request.fromLocationId.toString(),
    );
    if (!userHasAccessToSourceLocation) {
      throw AppError.forbidden(
        "Only users assigned to the source location can respond to transfer requests",
      );
    }

    if (request.status !== "requested") {
      throw AppError.badRequest(
        `Cannot respond to a request in ${request.status} status`,
      );
    }

    if (status === "rejected") {
      if (!rejectionReasonId) {
        throw AppError.badRequest(
          "Rejection reason is required when rejecting a request",
        );
      }
      const reason = await TransferRejectionReason.findOne({
        _id: rejectionReasonId,
        organizationId,
        isActive: true,
      });
      if (!reason) throw AppError.notFound("Rejection reason not found");

      (request as any).rejectionReasonId = reason._id;
      if (rejectionNote !== undefined) {
        (request as any).rejectionNote = rejectionNote;
      }
    }

    request.status = status;
    request.approvedBy = userId as any;
    request.respondedAt = new Date();
    await request.save();

    return request;
  }

  /**
   * List transfer requests
   */
  async listRequests(
    organizationId: string | Types.ObjectId,
    filters: any = {},
  ) {
    return TransferRequest.find({ organizationId, ...filters })
      .populate("requestedBy", "name email")
      .populate("fromLocationId", "name")
      .populate("toLocationId", "name")
      .sort({ createdAt: -1 });
  }

  /**
   * Cancel a transfer request
   * Only the user who created the request can cancel it, and only when status is "requested"
   */
  async cancelRequest(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    requestId: string | Types.ObjectId,
  ) {
    const request = await TransferRequest.findOne({
      _id: requestId,
      organizationId,
    });
    if (!request) throw AppError.notFound("Transfer request not found");

    if (request.requestedBy.toString() !== userId.toString()) {
      throw AppError.forbidden(
        "Only the user who created the request can cancel it",
      );
    }

    if (request.status !== "requested") {
      throw AppError.badRequest(
        `Cannot cancel a request that is already in ${request.status} status`,
      );
    }

    request.status = "cancelled";
    await request.save();

    return request;
  }

  /**
   * Edit a transfer request (items and notes)
   * Only the user who created the request can edit it, and only when status is "requested"
   */
  async updateRequest(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    requestId: string | Types.ObjectId,
    payload: Partial<
      Pick<TransferRequestInput, "items" | "notes" | "neededBy">
    >,
  ) {
    const request = await TransferRequest.findOne({
      _id: requestId,
      organizationId,
    });
    if (!request) throw AppError.notFound("Transfer request not found");

    if (request.requestedBy.toString() !== userId.toString()) {
      throw AppError.forbidden(
        "Only the user who created the request can edit it",
      );
    }

    if (request.status !== "requested") {
      throw AppError.badRequest(
        `Cannot edit a request that is already in ${request.status} status`,
      );
    }

    if (payload.items !== undefined) {
      (request as any).items = payload.items;
    }
    if (payload.notes !== undefined) {
      (request as any).notes = payload.notes;
    }
    if (payload.neededBy !== undefined) {
      (request as any).neededBy = new Date(payload.neededBy);
    }

    await request.save();

    return request;
  }

  /**
   * Initiate a physical transfer (Shipment)
   */
  async initiateTransfer(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    payload: TransferInput,
  ) {
    // 1. Validate locations
    const [fromLocation, toLocation] = await Promise.all([
      Location.findOne({
        _id: payload.fromLocationId,
        organizationId,
        isActive: true,
      }),
      Location.findOne({
        _id: payload.toLocationId,
        organizationId,
        isActive: true,
      }),
    ]);

    if (!fromLocation)
      throw AppError.notFound("Origin location not found or inactive");
    if (!toLocation)
      throw AppError.notFound("Destination location not found or inactive");

    // 2. If requestId is provided, validate it
    if (payload.requestId) {
      const request = await TransferRequest.findOne({
        _id: payload.requestId,
        organizationId,
      });
      if (!request) throw AppError.notFound("Transfer request not found");
      if (request.status !== "approved" && request.status !== "requested") {
        throw AppError.badRequest(
          "Can only initiate a transfer for a requested or approved request",
        );
      }
    }

    // 3. Validate items (must be at origin location and available)
    const instanceIds = payload.items.map((i) => i.instanceId);
    const instances = await MaterialInstance.find({
      _id: { $in: instanceIds },
      organizationId,
      locationId: payload.fromLocationId,
    });

    if (instances.length !== payload.items.length) {
      throw AppError.badRequest(
        "Some items are not at the origin location or belong to another organization",
      );
    }

    // Check if any item is not available
    const unavailableItems = instances.filter(
      (inst) => inst.status !== "available",
    );
    if (unavailableItems.length > 0) {
      throw AppError.badRequest(
        "Some items are not in 'available' status and cannot be transferred",
      );
    }

    // 4. Atomically update instances, create transfer record, and fulfil the request
    const session = await startSession();
    return await session.withTransaction(async () => {
      await MaterialInstance.updateMany(
        { _id: { $in: instanceIds } },
        { $set: { status: "in_use" } },
        { session },
      );

      const [transfer] = await Transfer.create(
        [
          {
            fromLocationId: payload.fromLocationId,
            toLocationId: payload.toLocationId,
            items: payload.items,
            organizationId,
            pickedBy: userId,
            status: "in_transit" as const,
            sentAt: new Date(),
            ...(payload.requestId !== undefined && {
              requestId: payload.requestId,
            }),
            ...(payload.senderNotes !== undefined && {
              senderNotes: payload.senderNotes,
            }),
          },
        ],
        { session },
      );

      // 5. Update request fulfillment if requestId is provided
      if (payload.requestId) {
        const tr = await TransferRequest.findOne({
          _id: payload.requestId,
          organizationId,
        }).session(session);

        if (tr) {
          // Count shipped instances by modelId
          const shippedCounts: Record<string, number> = {};
          instances.forEach((inst) => {
            const mId = inst.modelId.toString();
            shippedCounts[mId] = (shippedCounts[mId] || 0) + 1;
          });

          // Update fulfilledQuantity for each matching item in the request
          tr.items.forEach((reqItem) => {
            const mId = reqItem.modelId.toString();
            if (shippedCounts[mId]) {
              (reqItem as any).fulfilledQuantity =
                ((reqItem as any).fulfilledQuantity || 0) + shippedCounts[mId];
            }
          });

          // Determine if all targets are met
          const allMet = tr.items.every(
            (reqItem) =>
              ((reqItem as any).fulfilledQuantity || 0) >= reqItem.quantity,
          );

          if (allMet) {
            tr.status = "fulfilled";
          } else if (tr.status === "requested") {
            // If it was just requested, start fulfilling it moves it to 'approved' or similar
            // though staying in 'approved' is fine too.
            // But let's keep it 'approved' if not fully fulfilled yet.
            tr.status = "approved";
          }

          await tr.save({ session });
        }
      }

      return transfer;
    });
  }

  /**
   * Receive a transfer
   */
  async receiveTransfer(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    transferId: string | Types.ObjectId,
    receiverNotes?: string,
    itemConditions?: Array<{ instanceId: string; receivedCondition: string }>,
  ) {
    const session = await startSession();
    return await session.withTransaction(async () => {
      const transfer = await Transfer.findOne({
        _id: transferId,
        organizationId,
      }).session(session);
      if (!transfer) throw AppError.notFound("Transfer not found");

      if (transfer.status !== "in_transit") {
        throw AppError.badRequest(
          `Cannot receive a transfer in ${transfer.status} status`,
        );
      }

      // Update transfer
      transfer.status = "received";
      transfer.receivedBy = userId as any;
      transfer.receivedAt = new Date();
      if (receiverNotes) transfer.receiverNotes = receiverNotes;

      // Apply per-item received conditions if provided
      if (itemConditions && itemConditions.length > 0) {
        for (const item of transfer.items) {
          const condition = itemConditions.find(
            (c) => c.instanceId.toString() === item.instanceId.toString(),
          );
          if (condition) {
            (item as any).receivedCondition = condition.receivedCondition;
          }
        }
      }

      await transfer.save({ session });

      // Update instances: set new location and set back to 'available'
      const instanceIds = transfer.items.map((i) => i.instanceId);
      await MaterialInstance.updateMany(
        { _id: { $in: instanceIds } },
        {
          $set: {
            locationId: transfer.toLocationId,
            status: "available",
          },
        },
        { session },
      );

      return transfer;
    });
  }

  /**
   * List transfers
   */
  async listTransfers(
    organizationId: string | Types.ObjectId,
    filters: any = {},
  ) {
    return Transfer.find({ organizationId, ...filters })
      .populate("pickedBy", "name email")
      .populate("receivedBy", "name email")
      .populate("fromLocationId", "name")
      .populate("toLocationId", "name")
      .sort({ createdAt: -1 });
  }

  /**
   * Get transfer details
   */
  async getTransferDetails(
    organizationId: string | Types.ObjectId,
    transferId: string | Types.ObjectId,
  ) {
    const transfer = await Transfer.findOne({ _id: transferId, organizationId })
      .populate("pickedBy", "name email")
      .populate("receivedBy", "name email")
      .populate("fromLocationId", "name")
      .populate("toLocationId", "name")
      .populate("items.instanceId");

    if (!transfer) throw AppError.notFound("Transfer not found");
    return transfer;
  }

  // ============================================================================
  // TRANSFER REJECTION REASONS
  // ============================================================================

  /**
   * Seed default rejection reasons for a new organization
   */
  async seedDefaultRejectionReasons(
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const existing = await TransferRejectionReason.findOne({
      organizationId,
    }).session(session ?? null);
    if (existing) return; // idempotent

    const defaults = [
      "Can't send in time",
      "Unviable loan profit vs transfer cost",
      "Items already committed to another loan",
      "Insufficient inventory at origin",
    ];

    await TransferRejectionReason.insertMany(
      defaults.map((label) => ({
        organizationId,
        label,
        isActive: true,
        isDefault: true,
      })),
      { session: session ?? null },
    );
  }

  /**
   * List rejection reasons for an organization
   */
  async listRejectionReasons(
    organizationId: string | Types.ObjectId,
    includeInactive = false,
  ) {
    const filter: Record<string, unknown> = { organizationId };
    if (!includeInactive) filter.isActive = true;

    const reasons = await TransferRejectionReason.find(filter).sort({
      label: 1,
    });

    return reasons.map((r) => ({
      id: r._id,
      label: r.label,
      isActive: r.isActive,
      isDefault: r.isDefault,
    }));
  }

  /**
   * Create a new rejection reason
   */
  async createRejectionReason(
    organizationId: string | Types.ObjectId,
    data: TransferRejectionReasonInput,
  ) {
    const duplicate = await TransferRejectionReason.findOne({
      organizationId,
      label: { $regex: new RegExp(`^${data.label}$`, "i") },
    });
    if (duplicate)
      throw AppError.conflict(
        "A rejection reason with this label already exists",
      );

    const reason = await TransferRejectionReason.create({
      organizationId,
      label: data.label,
      isActive: data.isActive ?? true,
      isDefault: false,
    });

    return {
      id: reason._id,
      label: reason.label,
      isActive: reason.isActive,
      isDefault: reason.isDefault,
    };
  }

  /**
   * Update a rejection reason
   */
  async updateRejectionReason(
    organizationId: string | Types.ObjectId,
    reasonId: string,
    data: Partial<TransferRejectionReasonInput>,
  ) {
    const reason = await TransferRejectionReason.findOne({
      _id: reasonId,
      organizationId,
    });
    if (!reason) throw AppError.notFound("Rejection reason not found");

    if (data.label !== undefined && data.label !== reason.label) {
      const duplicate = await TransferRejectionReason.findOne({
        organizationId,
        label: { $regex: new RegExp(`^${data.label}$`, "i") },
        _id: { $ne: reason._id },
      });
      if (duplicate)
        throw AppError.conflict(
          "A rejection reason with this label already exists",
        );
      reason.label = data.label;
    }

    if (data.isActive !== undefined) {
      reason.isActive = data.isActive;
    }

    await reason.save();

    return {
      id: reason._id,
      label: reason.label,
      isActive: reason.isActive,
      isDefault: reason.isDefault,
    };
  }

  /**
   * Delete a rejection reason (default reasons cannot be deleted)
   */
  async deleteRejectionReason(
    organizationId: string | Types.ObjectId,
    reasonId: string,
  ) {
    const reason = await TransferRejectionReason.findOne({
      _id: reasonId,
      organizationId,
    });
    if (!reason) throw AppError.notFound("Rejection reason not found");
    if (reason.isDefault)
      throw AppError.badRequest("Default rejection reasons cannot be deleted");

    await reason.deleteOne();
  }
}

export const transferService = new TransferService();

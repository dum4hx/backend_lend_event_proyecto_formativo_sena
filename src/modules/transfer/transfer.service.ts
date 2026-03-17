import { AppError } from "../../errors/AppError.ts";
import { Transfer, type TransferInput } from "./models/transfer.model.ts";
import {
  TransferRequest,
  type TransferRequestInput,
} from "./models/transfer_request.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { Location } from "../location/models/location.model.ts";
import { Types, startSession } from "mongoose";

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
    });

    return request;
  }

  /**
   * Respond to a transfer request (Approve/Reject/Cancel)
   */
  async respondToRequest(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    requestId: string | Types.ObjectId,
    status: "approved" | "rejected",
  ) {
    const request = await TransferRequest.findOne({
      _id: requestId,
      organizationId,
    });
    if (!request) throw AppError.notFound("Transfer request not found");

    if (request.status !== "requested") {
      throw AppError.badRequest(
        `Cannot respond to a request in ${request.status} status`,
      );
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
      if (request.status !== "approved") {
        throw AppError.badRequest(
          "Can only initiate a transfer for an approved request",
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
}

export const transferService = new TransferService();

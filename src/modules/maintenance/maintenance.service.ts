import { Types } from "mongoose";
import {
  MaintenanceBatch,
  type MaintenanceBatchCreateInput,
  type MaintenanceBatchItemInput,
  type MaintenanceBatchResolveItemInput,
  batchStatusOptions,
} from "./models/maintenance_batch.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { materialService } from "../material/material.service.ts";
import { AppError } from "../../errors/AppError.ts";

/* ---------- Batch State Machine ---------- */

const BATCH_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const ITEM_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["in_repair", "cancelled"],
  in_repair: ["repaired", "unrecoverable"],
  repaired: [],
  unrecoverable: [],
  cancelled: [],
};

function validateBatchTransition(current: string, next: string): void {
  const allowed = BATCH_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw AppError.conflict(
      `Invalid batch status transition from "${current}" to "${next}"`,
    );
  }
}

function validateItemTransition(current: string, next: string): void {
  const allowed = ITEM_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw AppError.conflict(
      `Invalid item status transition from "${current}" to "${next}"`,
    );
  }
}

/* ---------- Service ---------- */

export const maintenanceService = {
  /**
   * Lists maintenance batches with pagination and optional filters.
   */
  async listBatches(params: {
    organizationId: string | Types.ObjectId;
    page: number;
    limit: number;
    status?: string;
    assignedTo?: string;
  }) {
    const { organizationId, page, limit, status, assignedTo } = params;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { organizationId };
    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;

    const [batches, total] = await Promise.all([
      MaintenanceBatch.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("assignedTo", "email firstName lastName")
        .populate("createdBy", "email firstName lastName")
        .populate("locationId", "name")
        .lean(),
      MaintenanceBatch.countDocuments(query),
    ]);

    return {
      batches,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Gets a single batch by ID with populated references.
   */
  async getBatchById(id: string, organizationId: string | Types.ObjectId) {
    const batch = await MaintenanceBatch.findOne({ _id: id, organizationId })
      .populate("assignedTo", "email firstName lastName")
      .populate("createdBy", "email firstName lastName")
      .populate("locationId", "name")
      .populate("items.materialInstanceId", "serialNumber barcode modelId")
      .lean();

    if (!batch) {
      throw AppError.notFound("Maintenance batch not found");
    }

    return batch;
  },

  /**
   * Creates a new maintenance batch in draft status.
   */
  async createBatch(params: {
    organizationId: string | Types.ObjectId;
    createdBy: string | Types.ObjectId;
    data: MaintenanceBatchCreateInput;
  }) {
    const { organizationId, createdBy, data } = params;

    const doc: Record<string, unknown> = {
      organizationId,
      createdBy,
      name: data.name,
      status: "draft",
      items: [],
    };
    if (data.description !== undefined) doc.description = data.description;
    if (data.scheduledStartDate !== undefined)
      doc.scheduledStartDate = data.scheduledStartDate;
    if (data.scheduledEndDate !== undefined)
      doc.scheduledEndDate = data.scheduledEndDate;
    if (data.assignedTo !== undefined) doc.assignedTo = data.assignedTo;
    if (data.locationId !== undefined) doc.locationId = data.locationId;
    if (data.notes !== undefined) doc.notes = data.notes;

    const batch = await MaintenanceBatch.create(doc);

    return batch.toObject();
  },

  /**
   * Updates batch metadata. Only allowed when batch is in draft status.
   */
  async updateBatch(
    id: string,
    organizationId: string | Types.ObjectId,
    updates: Partial<MaintenanceBatchCreateInput>,
  ) {
    const batch = await MaintenanceBatch.findOne({ _id: id, organizationId });
    if (!batch) {
      throw AppError.notFound("Maintenance batch not found");
    }

    if (batch.status !== "draft") {
      throw AppError.conflict(
        "Batch can only be updated while in draft status",
      );
    }

    Object.assign(batch, updates);
    await batch.save();

    return batch.toObject();
  },

  /**
   * Adds items to a draft batch. Validates instance ownership and
   * checks the instance is not already in an active batch.
   */
  async addItems(
    batchId: string,
    organizationId: string | Types.ObjectId,
    actorUserId: string | Types.ObjectId,
    items: MaintenanceBatchItemInput[],
  ) {
    const batch = await MaintenanceBatch.findOne({
      _id: batchId,
      organizationId,
    });
    if (!batch) {
      throw AppError.notFound("Maintenance batch not found");
    }

    if (batch.status !== "draft") {
      throw AppError.conflict("Items can only be added while batch is draft");
    }

    for (const item of items) {
      // Validate instance belongs to org
      const instance = await MaterialInstance.findOne({
        _id: item.materialInstanceId,
        organizationId,
      });
      if (!instance) {
        throw AppError.notFound(
          `Material instance ${item.materialInstanceId} not found in organization`,
        );
      }

      // Check instance not already in an active batch (draft or in_progress)
      const existingBatch = await MaintenanceBatch.findOne({
        organizationId,
        status: { $in: ["draft", "in_progress"] },
        "items.materialInstanceId": item.materialInstanceId,
      });
      if (existingBatch && existingBatch._id.toString() !== batchId) {
        throw AppError.conflict(
          `Material instance ${item.materialInstanceId} is already in active maintenance batch "${existingBatch.name}"`,
        );
      }

      // Also check it's not a duplicate inside this same batch
      const alreadyInBatch = batch.items.some(
        (existing) =>
          existing.materialInstanceId.toString() === item.materialInstanceId,
      );
      if (alreadyInBatch) {
        throw AppError.conflict(
          `Material instance ${item.materialInstanceId} is already in this batch`,
        );
      }

      batch.items.push({
        materialInstanceId: new Types.ObjectId(item.materialInstanceId),
        entryReason: item.entryReason,
        itemStatus: "pending",
        sourceType: item.sourceType,
        sourceId: item.sourceId
          ? new Types.ObjectId(item.sourceId)
          : undefined,
        sourceItemIndex: item.sourceItemIndex,
        estimatedCost: item.estimatedCost,
        repairNotes: item.repairNotes,
      } as any);
    }

    // Recalculate total estimated cost
    batch.totalEstimatedCost = batch.items.reduce(
      (sum, i) => sum + (i.estimatedCost ?? 0),
      0,
    );

    await batch.save();

    return batch.toObject();
  },

  /**
   * Removes an item from a draft batch.
   */
  async removeItem(
    batchId: string,
    organizationId: string | Types.ObjectId,
    materialInstanceId: string,
  ) {
    const batch = await MaintenanceBatch.findOne({
      _id: batchId,
      organizationId,
    });
    if (!batch) {
      throw AppError.notFound("Maintenance batch not found");
    }

    if (batch.status !== "draft") {
      throw AppError.conflict(
        "Items can only be removed while batch is draft",
      );
    }

    const itemIndex = batch.items.findIndex(
      (item) => item.materialInstanceId.toString() === materialInstanceId,
    );
    if (itemIndex === -1) {
      throw AppError.notFound("Item not found in batch");
    }

    batch.items.splice(itemIndex, 1);

    batch.totalEstimatedCost = batch.items.reduce(
      (sum, i) => sum + (i.estimatedCost ?? 0),
      0,
    );

    await batch.save();

    return batch.toObject();
  },

  /**
   * Starts a batch: transitions draft → in_progress.
   * Requires at least 1 item. Transitions each pending item to in_repair
   * and syncs material instance status to "maintenance".
   */
  async startBatch(
    batchId: string,
    organizationId: string | Types.ObjectId,
    actorUserId: string | Types.ObjectId,
  ) {
    const batch = await MaintenanceBatch.findOne({
      _id: batchId,
      organizationId,
    });
    if (!batch) {
      throw AppError.notFound("Maintenance batch not found");
    }

    validateBatchTransition(batch.status, "in_progress");

    if (batch.items.length === 0) {
      throw AppError.conflict("Cannot start a batch with no items");
    }

    // Transition each pending item to in_repair and sync instance status
    for (const item of batch.items) {
      if (item.itemStatus === "pending") {
        await materialService.updateInstanceStatus(
          organizationId,
          item.materialInstanceId.toString(),
          "maintenance",
          `Entered maintenance batch "${batch.name}"`,
          actorUserId,
          "system",
        );

        item.itemStatus = "in_repair";
      }
    }

    batch.status = "in_progress";
    batch.startedAt = new Date();
    await batch.save();

    return batch.toObject();
  },

  /**
   * Resolves a single item in an in_progress batch.
   * If all items are resolved, auto-completes the batch.
   */
  async resolveItem(
    batchId: string,
    organizationId: string | Types.ObjectId,
    actorUserId: string | Types.ObjectId,
    materialInstanceId: string,
    data: MaintenanceBatchResolveItemInput,
  ) {
    const batch = await MaintenanceBatch.findOne({
      _id: batchId,
      organizationId,
    });
    if (!batch) {
      throw AppError.notFound("Maintenance batch not found");
    }

    if (batch.status !== "in_progress") {
      throw AppError.conflict("Items can only be resolved in an active batch");
    }

    const item = batch.items.find(
      (i) => i.materialInstanceId.toString() === materialInstanceId,
    );
    if (!item) {
      throw AppError.notFound("Item not found in batch");
    }

    validateItemTransition(item.itemStatus, data.resolution);

    // Sync material instance status
    const newInstanceStatus =
      data.resolution === "repaired" ? "available" : "retired";
    await materialService.updateInstanceStatus(
      organizationId,
      materialInstanceId,
      newInstanceStatus,
      data.repairNotes ?? `Maintenance resolved as ${data.resolution}`,
      actorUserId,
      "system",
    );

    item.itemStatus = data.resolution;
    item.resolvedAt = new Date();
    if (data.actualCost !== undefined) item.actualCost = data.actualCost;
    if (data.repairNotes !== undefined) item.repairNotes = data.repairNotes;

    // Recalculate total actual cost
    batch.totalActualCost = batch.items.reduce(
      (sum, i) => sum + (i.actualCost ?? 0),
      0,
    );

    // Auto-complete batch if all items are resolved
    const allResolved = batch.items.every((i) =>
      ["repaired", "unrecoverable", "cancelled"].includes(i.itemStatus),
    );
    if (allResolved) {
      batch.status = "completed";
      batch.completedAt = new Date();
    }

    await batch.save();

    return batch.toObject();
  },

  /**
   * Cancels a batch from draft or in_progress.
   * For in_progress batches, reverts in_repair items to damaged status.
   */
  async cancelBatch(
    batchId: string,
    organizationId: string | Types.ObjectId,
    actorUserId: string | Types.ObjectId,
  ) {
    const batch = await MaintenanceBatch.findOne({
      _id: batchId,
      organizationId,
    });
    if (!batch) {
      throw AppError.notFound("Maintenance batch not found");
    }

    validateBatchTransition(batch.status, "cancelled");

    // If in_progress, revert in_repair items to damaged
    if (batch.status === "in_progress") {
      for (const item of batch.items) {
        if (item.itemStatus === "in_repair") {
          await materialService.updateInstanceStatus(
            organizationId,
            item.materialInstanceId.toString(),
            "damaged",
            `Maintenance batch "${batch.name}" cancelled`,
            actorUserId,
            "system",
          );
        }
      }
    }

    // Mark all non-terminal items as cancelled
    for (const item of batch.items) {
      if (["pending", "in_repair"].includes(item.itemStatus)) {
        item.itemStatus = "cancelled";
      }
    }

    batch.status = "cancelled";
    await batch.save();

    return batch.toObject();
  },
};

import { Types } from "mongoose";
import { Loan } from "../loan/models/loan.model.ts";
import { Inspection } from "../inspection/models/inspection.model.ts";
import { Invoice } from "../invoice/models/invoice.model.ts";
import { Transfer } from "../transfer/models/transfer.model.ts";
import { TransferRequest } from "../transfer/models/transfer_request.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { Location } from "../location/models/location.model.ts";
import { AppError } from "../../errors/AppError.ts";

/* ================================================================
 * OPERATIONS SERVICE
 * ================================================================
 * Provides pre-computed, actionable operational data per location.
 * All queries are tenant-scoped and use aggregation pipelines
 * for efficiency — no heavy in-memory computation.
 * ================================================================ */

/* ---------- Types ---------- */

interface Alert {
  type: string;
  count: number;
  severity: "high" | "medium" | "low";
}

interface OverviewResult {
  inventory: {
    itemsInRepair: number;
    itemsPendingInspection: number;
    itemsMissing: number;
    itemsDamaged: number;
  };
  loans: {
    active: number;
    dueToday: number;
    overdue: number;
    returnPendingInspection: number;
  };
  financials: {
    overdueInvoices: number;
    pendingDepositsToRefund: number;
    unresolvedDamageCharges: number;
  };
  transfers: {
    incomingPending: number;
    outgoingPending: number;
    transfersInTransit: number;
  };
  alerts: Alert[];
}

interface InspectionQueueItem {
  loanId: string;
  instanceId: string;
  materialTypeName: string;
  serialNumber: string;
  returnedAt: Date;
  timeWaitingMinutes: number;
  priority: "high" | "medium" | "low";
  loanEndDate: Date;
  customerName: string;
}

interface OverdueInvoice {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  daysOverdue: number;
}

interface PendingDepositRefund {
  loanId: string;
  customerId: string;
  customerName: string;
  amount: number;
  waitingSinceDays: number;
}

interface OverdueFinancialsResult {
  overdueInvoices: OverdueInvoice[];
  pendingDepositRefunds: PendingDepositRefund[];
}

interface InventoryIssueItem {
  instanceId: string;
  serialNumber: string;
  materialTypeName: string;
  status: string;
  locationId: string;
}

interface LowStockModel {
  modelId: string;
  modelName: string;
  available: number;
  maxQuantity: number;
  currentQuantity: number;
}

interface InventoryIssuesResult {
  missingItems: InventoryIssueItem[];
  damagedItems: InventoryIssueItem[];
  inRepair: InventoryIssueItem[];
  lowStockModels: LowStockModel[];
}

interface TransferQueueItem {
  id: string;
  fromLocationName: string;
  toLocationName: string;
  itemCount: number;
  status: string;
  createdAt: Date;
  action: "approve" | "send" | "receive";
}

interface TransferActionQueueResult {
  pendingApproval: TransferQueueItem[];
  outgoingToSend: TransferQueueItem[];
  incomingToReceive: TransferQueueItem[];
}

interface LoanDeadlineItem {
  loanId: string;
  customerId: string;
  customerName: string;
  endDate: Date;
  itemCount: number;
  status: string;
}

interface LoanDeadlinesResult {
  overdue: LoanDeadlineItem[];
  dueToday: LoanDeadlineItem[];
  dueTomorrow: LoanDeadlineItem[];
}

interface DamageQueueItem {
  inspectionId: string;
  loanId: string;
  instanceId: string;
  serialNumber: string;
  materialTypeName: string;
  conditionAfter: string;
  damageDescription: string;
  estimatedRepairCost: number;
  chargeToCustomer: number;
  inspectionStatus: string;
  repairRequired: boolean;
  transitionedToStatus: string;
  invoiceId?: string;
}

interface DamageResolutionResult {
  pendingAssessment: DamageQueueItem[];
  pendingRepair: DamageQueueItem[];
  pendingBilling: DamageQueueItem[];
}

interface TaskItem {
  type: string;
  priority: "high" | "medium" | "low";
  count: number;
  action: string;
}

/* ---------- Helper ---------- */

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

async function validateLocationBelongsToOrg(
  orgId: Types.ObjectId,
  locationId: Types.ObjectId,
): Promise<void> {
  const location = await Location.findOne({
    _id: locationId,
    organizationId: orgId,
  }).select("_id");
  if (!location) {
    throw AppError.notFound(
      "Ubicación no encontrada o no pertenece a esta organización",
    );
  }
}

/* ================================================================
 * 1. OVERVIEW
 * ================================================================ */

async function getOverview(
  orgId: Types.ObjectId,
  locationId: Types.ObjectId,
  skipValidation = false,
): Promise<OverviewResult> {
  if (!skipValidation) await validateLocationBelongsToOrg(orgId, locationId);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const orgFilter = { organizationId: orgId };

  // --- Inventory counts (location-scoped) ---
  const [inventoryCounts] = await MaterialInstance.aggregate([
    {
      $match: {
        ...orgFilter,
        locationId: locationId,
      },
    },
    {
      $group: {
        _id: null,
        inRepair: {
          $sum: { $cond: [{ $eq: ["$status", "maintenance"] }, 1, 0] },
        },
        damaged: {
          $sum: { $cond: [{ $eq: ["$status", "damaged"] }, 1, 0] },
        },
        missing: {
          $sum: { $cond: [{ $eq: ["$status", "lost"] }, 1, 0] },
        },
      },
    },
  ]);

  // --- Loans: query directly by locationId (stable field set at checkout) ---
  const loanLocationFilter = { ...orgFilter, locationId: locationId };

  const [loanCounts] = await Loan.aggregate([
    {
      $match: loanLocationFilter,
    },
    {
      $group: {
        _id: null,
        active: {
          $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
        },
        dueToday: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ["$status", ["active", "overdue"]] },
                  { $gte: ["$endDate", todayStart] },
                  { $lte: ["$endDate", todayEnd] },
                ],
              },
              1,
              0,
            ],
          },
        },
        overdue: {
          $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] },
        },
        returnPendingInspection: {
          $sum: { $cond: [{ $eq: ["$status", "returned"] }, 1, 0] },
        },
      },
    },
  ]);

  // --- Financials ---

  // Overdue invoices scoped to this location via loan $lookup (avoids unbounded $in)
  const [overdueInvoiceAgg] = await Invoice.aggregate([
    {
      $match: {
        organizationId: orgId,
        status: { $in: ["pending", "overdue", "partially_paid"] },
        dueDate: { $lt: now },
      },
    },
    {
      $lookup: {
        from: "loans",
        let: { loanId: "$loanId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$loanId"] },
                  { $eq: ["$locationId", locationId] },
                ],
              },
            },
          },
          { $project: { _id: 1 } },
          { $limit: 1 },
        ],
        as: "loanData",
      },
    },
    { $match: { "loanData.0": { $exists: true } } },
    { $count: "total" },
  ]);
  const overdueInvoiceCount = overdueInvoiceAgg?.total ?? 0;

  // Pending deposit refunds — loans at this location with deposit.status = "refund_pending"
  const pendingRefundCount = await Loan.countDocuments({
    ...loanLocationFilter,
    "deposit.status": "refund_pending",
  });

  // Unresolved damage charges — completed inspections for loans at this location with no invoice
  const [unresolvedDamageAgg] = await Inspection.aggregate([
    {
      $match: {
        organizationId: orgId,
        status: "completed",
        additionalChargeRequired: { $gt: 0 },
        invoiceId: { $exists: false },
      },
    },
    {
      $lookup: {
        from: "loans",
        let: { loanId: "$loanId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$loanId"] },
                  { $eq: ["$locationId", locationId] },
                ],
              },
            },
          },
          { $project: { _id: 1 } },
          { $limit: 1 },
        ],
        as: "loanData",
      },
    },
    { $match: { "loanData.0": { $exists: true } } },
    { $count: "total" },
  ]);
  const unresolvedDamageCount = unresolvedDamageAgg?.total ?? 0;

  // --- Transfers ---
  const incomingInTransit = await Transfer.countDocuments({
    ...orgFilter,
    toLocationId: locationId,
    status: "in_transit",
  });
  const outgoingPending = await Transfer.countDocuments({
    ...orgFilter,
    fromLocationId: locationId,
    status: "picking",
  });
  const outgoingInTransit = await Transfer.countDocuments({
    ...orgFilter,
    fromLocationId: locationId,
    status: "in_transit",
  });

  // --- Build alerts ---
  const alerts: Alert[] = [];

  const inv = inventoryCounts ?? { inRepair: 0, damaged: 0, missing: 0 };
  const ln = loanCounts ?? {
    active: 0,
    dueToday: 0,
    overdue: 0,
    returnPendingInspection: 0,
  };

  if (ln.overdue > 0) {
    alerts.push({ type: "overdue_loans", count: ln.overdue, severity: "high" });
  }
  if (inv.missing > 0) {
    alerts.push({
      type: "missing_items",
      count: inv.missing,
      severity: "high",
    });
  }
  if (overdueInvoiceCount > 0) {
    alerts.push({
      type: "overdue_invoices",
      count: overdueInvoiceCount,
      severity: "high",
    });
  }
  if (unresolvedDamageCount > 0) {
    alerts.push({
      type: "unresolved_damages",
      count: unresolvedDamageCount,
      severity: "medium",
    });
  }
  if (ln.dueToday > 0) {
    alerts.push({
      type: "loans_due_today",
      count: ln.dueToday,
      severity: "medium",
    });
  }
  if (pendingRefundCount > 0) {
    alerts.push({
      type: "pending_refunds",
      count: pendingRefundCount,
      severity: "medium",
    });
  }
  if (incomingInTransit > 0) {
    alerts.push({
      type: "incoming_transfers",
      count: incomingInTransit,
      severity: "low",
    });
  }

  return {
    inventory: {
      itemsInRepair: inv.inRepair,
      itemsPendingInspection: ln.returnPendingInspection,
      itemsMissing: inv.missing,
      itemsDamaged: inv.damaged,
    },
    loans: {
      active: ln.active,
      dueToday: ln.dueToday,
      overdue: ln.overdue,
      returnPendingInspection: ln.returnPendingInspection,
    },
    financials: {
      overdueInvoices: overdueInvoiceCount,
      pendingDepositsToRefund: pendingRefundCount,
      unresolvedDamageCharges: unresolvedDamageCount,
    },
    transfers: {
      incomingPending: incomingInTransit,
      outgoingPending,
      transfersInTransit: incomingInTransit + outgoingInTransit,
    },
    alerts,
  };
}

/* ================================================================
 * 2. INSPECTION WORK QUEUE
 * ================================================================ */

async function getInspectionQueue(
  orgId: Types.ObjectId,
  locationId: Types.ObjectId,
  skipValidation = false,
): Promise<InspectionQueueItem[]> {
  if (!skipValidation) await validateLocationBelongsToOrg(orgId, locationId);

  const now = new Date();

  // Find loans with status "returned" at this location whose instances are pending inspection
  const results = await Loan.aggregate([
    {
      $match: {
        organizationId: orgId,
        locationId: locationId,
        status: "returned",
      },
    },
    // Unwind material instances to check each one
    { $unwind: "$materialInstances" },
    // Only items without a conditionAtReturn (not yet inspected)
    {
      $match: {
        "materialInstances.conditionAtReturn": { $exists: false },
      },
    },
    // Lookup instance to check location
    {
      $lookup: {
        from: "materialinstances",
        localField: "materialInstances.materialInstanceId",
        foreignField: "_id",
        as: "instance",
      },
    },
    { $unwind: "$instance" },
    { $match: { "instance.locationId": locationId } },
    // Lookup material type name
    {
      $lookup: {
        from: "materialtypes",
        localField: "materialInstances.materialTypeId",
        foreignField: "_id",
        as: "materialType",
      },
    },
    { $unwind: { path: "$materialType", preserveNullAndEmptyArrays: true } },
    // Lookup customer name
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
    // Project fields
    {
      $project: {
        loanId: "$_id",
        instanceId: "$materialInstances.materialInstanceId",
        materialTypeName: { $ifNull: ["$materialType.name", "Unknown"] },
        serialNumber: "$instance.serialNumber",
        returnedAt: "$returnedAt",
        timeWaitingMinutes: {
          $divide: [{ $subtract: [now, "$returnedAt"] }, 60000],
        },
        loanEndDate: "$endDate",
        customerName: {
          $concat: [
            { $ifNull: ["$customer.firstName", ""] },
            " ",
            { $ifNull: ["$customer.lastName", ""] },
          ],
        },
      },
    },
    // Priority: overdue first, then by wait time
    {
      $addFields: {
        priority: {
          $switch: {
            branches: [
              {
                case: { $lt: ["$loanEndDate", now] },
                then: "high",
              },
              {
                case: { $gt: ["$timeWaitingMinutes", 1440] },
                then: "medium",
              }, // > 24h
            ],
            default: "low",
          },
        },
        prioritySort: {
          $switch: {
            branches: [
              { case: { $lt: ["$loanEndDate", now] }, then: 0 },
              { case: { $gt: ["$timeWaitingMinutes", 1440] }, then: 1 },
            ],
            default: 2,
          },
        },
      },
    },
    { $sort: { prioritySort: 1, timeWaitingMinutes: -1 } },
    { $project: { prioritySort: 0 } },
    { $limit: 100 },
  ]);

  return results;
}

/* ================================================================
 * 3. OVERDUE FINANCIAL OBLIGATIONS
 * ================================================================ */

async function getOverdueFinancials(
  orgId: Types.ObjectId,
  locationId: Types.ObjectId,
  skipValidation = false,
): Promise<OverdueFinancialsResult> {
  if (!skipValidation) await validateLocationBelongsToOrg(orgId, locationId);

  const now = new Date();

  // --- Overdue invoices (location-scoped via loan $lookup) ---
  const overdueInvoices: OverdueInvoice[] = await Invoice.aggregate([
    {
      $match: {
        organizationId: orgId,
        status: { $in: ["pending", "overdue", "partially_paid"] },
        dueDate: { $lt: now },
      },
    },
    {
      $lookup: {
        from: "loans",
        let: { loanId: "$loanId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$loanId"] },
                  { $eq: ["$locationId", locationId] },
                ],
              },
            },
          },
          { $project: { _id: 1 } },
          { $limit: 1 },
        ],
        as: "loanData",
      },
    },
    { $match: { "loanData.0": { $exists: true } } },
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        invoiceId: "$_id",
        invoiceNumber: 1,
        customerId: 1,
        customerName: {
          $concat: [
            { $ifNull: ["$customer.firstName", ""] },
            " ",
            { $ifNull: ["$customer.lastName", ""] },
          ],
        },
        amount: "$amountDue",
        daysOverdue: {
          $ceil: {
            $divide: [{ $subtract: [now, "$dueDate"] }, 86400000],
          },
        },
      },
    },
    { $sort: { daysOverdue: -1 } },
    { $limit: 100 },
  ]);

  // --- Pending deposit refunds (location-scoped via locationId) ---
  const pendingDepositRefunds: PendingDepositRefund[] = await Loan.aggregate([
    {
      $match: {
        organizationId: orgId,
        locationId: locationId,
        "deposit.status": "refund_pending",
      },
    },
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        loanId: "$_id",
        customerId: 1,
        customerName: {
          $concat: [
            { $ifNull: ["$customer.firstName", ""] },
            " ",
            { $ifNull: ["$customer.lastName", ""] },
          ],
        },
        amount: "$deposit.amount",
        waitingSinceDays: {
          $ceil: {
            $divide: [
              { $subtract: [now, { $ifNull: ["$returnedAt", "$updatedAt"] }] },
              86400000,
            ],
          },
        },
      },
    },
    { $sort: { waitingSinceDays: -1 } },
    { $limit: 50 },
  ]);

  return { overdueInvoices, pendingDepositRefunds };
}

/* ================================================================
 * 4. INVENTORY ISSUES
 * ================================================================ */

async function getInventoryIssues(
  orgId: Types.ObjectId,
  locationId: Types.ObjectId,
  skipValidation = false,
): Promise<InventoryIssuesResult> {
  if (!skipValidation) await validateLocationBelongsToOrg(orgId, locationId);

  // --- Missing, damaged, in-repair items at this location ---
  const [issuesByStatus] = await MaterialInstance.aggregate([
    {
      $match: {
        organizationId: orgId,
        locationId: locationId,
        status: { $in: ["lost", "damaged", "maintenance"] },
      },
    },
    {
      $lookup: {
        from: "materialtypes",
        localField: "modelId",
        foreignField: "_id",
        as: "materialType",
      },
    },
    { $unwind: { path: "$materialType", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        instanceId: "$_id",
        serialNumber: 1,
        materialTypeName: { $ifNull: ["$materialType.name", "Unknown"] },
        status: 1,
        locationId: 1,
      },
    },
    {
      $facet: {
        missingItems: [{ $match: { status: "lost" } }, { $limit: 100 }],
        damagedItems: [{ $match: { status: "damaged" } }, { $limit: 100 }],
        inRepair: [{ $match: { status: "maintenance" } }, { $limit: 100 }],
      },
    },
  ]);

  const { missingItems, damagedItems, inRepair } = issuesByStatus;

  // --- Low stock models ---
  const location = await Location.findOne({
    _id: locationId,
    organizationId: orgId,
  }).select("materialCapacities");

  const lowStockModels: LowStockModel[] = [];
  if (location?.materialCapacities && location.materialCapacities.length > 0) {
    // Single aggregation: available counts by modelId at this location + material type names
    const availCounts: Array<{
      _id: Types.ObjectId;
      available: number;
      modelName: string;
    }> = await MaterialInstance.aggregate([
      {
        $match: {
          organizationId: orgId,
          locationId: locationId,
          status: "available",
        },
      },
      { $group: { _id: "$modelId", available: { $sum: 1 } } },
      {
        $lookup: {
          from: "materialtypes",
          localField: "_id",
          foreignField: "_id",
          as: "mt",
        },
      },
      { $unwind: { path: "$mt", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          available: 1,
          modelName: { $ifNull: ["$mt.name", "Unknown"] },
        },
      },
    ]);

    const availMap = new Map(
      availCounts.map((r) => [
        r._id.toString(),
        { available: r.available, modelName: r.modelName },
      ]),
    );

    for (const cap of location.materialCapacities) {
      if (!cap.maxQuantity || cap.maxQuantity <= 0) continue;
      const entry = availMap.get(cap.materialTypeId.toString());
      const availableCount = entry?.available ?? 0;
      const threshold = Math.max(1, Math.ceil(cap.maxQuantity * 0.2));
      if (availableCount <= threshold) {
        lowStockModels.push({
          modelId: cap.materialTypeId.toString(),
          modelName: entry?.modelName ?? "Unknown",
          available: availableCount,
          maxQuantity: cap.maxQuantity,
          currentQuantity: cap.currentQuantity,
        });
      }
    }
  }

  return { missingItems, damagedItems, inRepair, lowStockModels };
}

/* ================================================================
 * 5. TRANSFER ACTION QUEUE
 * ================================================================ */

async function getTransferQueue(
  orgId: Types.ObjectId,
  locationId: Types.ObjectId,
  skipValidation = false,
): Promise<TransferActionQueueResult> {
  if (!skipValidation) await validateLocationBelongsToOrg(orgId, locationId);

  const orgFilter = { organizationId: orgId };

  // --- Pending approval: TransferRequests FROM or TO this location, status = "requested" ---
  const pendingApprovalRaw = await TransferRequest.aggregate([
    {
      $match: {
        ...orgFilter,
        $or: [{ fromLocationId: locationId }, { toLocationId: locationId }],
        status: "requested",
      },
    },
    {
      $lookup: {
        from: "locations",
        localField: "fromLocationId",
        foreignField: "_id",
        as: "fromLoc",
      },
    },
    { $unwind: { path: "$fromLoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "locations",
        localField: "toLocationId",
        foreignField: "_id",
        as: "toLoc",
      },
    },
    { $unwind: { path: "$toLoc", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        id: "$_id",
        fromLocationName: { $ifNull: ["$fromLoc.name", "Unknown"] },
        toLocationName: { $ifNull: ["$toLoc.name", "Unknown"] },
        itemCount: { $size: "$items" },
        status: 1,
        createdAt: 1,
        action: "approve",
      },
    },
    { $sort: { createdAt: 1 } },
    { $limit: 50 },
  ]);

  // --- Outgoing to send: Transfers FROM this location, status = "picking" ---
  const outgoingToSendRaw = await Transfer.aggregate([
    {
      $match: {
        ...orgFilter,
        fromLocationId: locationId,
        status: "picking",
      },
    },
    {
      $lookup: {
        from: "locations",
        localField: "fromLocationId",
        foreignField: "_id",
        as: "fromLoc",
      },
    },
    { $unwind: { path: "$fromLoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "locations",
        localField: "toLocationId",
        foreignField: "_id",
        as: "toLoc",
      },
    },
    { $unwind: { path: "$toLoc", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        id: "$_id",
        fromLocationName: { $ifNull: ["$fromLoc.name", "Unknown"] },
        toLocationName: { $ifNull: ["$toLoc.name", "Unknown"] },
        itemCount: { $size: "$items" },
        status: 1,
        createdAt: 1,
        action: "send",
      },
    },
    { $sort: { createdAt: 1 } },
    { $limit: 50 },
  ]);

  // --- Incoming to receive: Transfers TO this location, status = "in_transit" ---
  const incomingToReceiveRaw = await Transfer.aggregate([
    {
      $match: {
        ...orgFilter,
        toLocationId: locationId,
        status: "in_transit",
      },
    },
    {
      $lookup: {
        from: "locations",
        localField: "fromLocationId",
        foreignField: "_id",
        as: "fromLoc",
      },
    },
    { $unwind: { path: "$fromLoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "locations",
        localField: "toLocationId",
        foreignField: "_id",
        as: "toLoc",
      },
    },
    { $unwind: { path: "$toLoc", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        id: "$_id",
        fromLocationName: { $ifNull: ["$fromLoc.name", "Unknown"] },
        toLocationName: { $ifNull: ["$toLoc.name", "Unknown"] },
        itemCount: { $size: "$items" },
        status: 1,
        createdAt: 1,
        action: "receive",
      },
    },
    { $sort: { createdAt: 1 } },
    { $limit: 50 },
  ]);

  return {
    pendingApproval: pendingApprovalRaw,
    outgoingToSend: outgoingToSendRaw,
    incomingToReceive: incomingToReceiveRaw,
  };
}

/* ================================================================
 * 6. LOAN DEADLINES
 * ================================================================ */

async function getLoanDeadlines(
  orgId: Types.ObjectId,
  locationId: Types.ObjectId,
  skipValidation = false,
): Promise<LoanDeadlinesResult> {
  if (!skipValidation) await validateLocationBelongsToOrg(orgId, locationId);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const basePipeline = [
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        loanId: "$_id",
        customerId: 1,
        customerName: {
          $concat: [
            { $ifNull: ["$customer.firstName", ""] },
            " ",
            { $ifNull: ["$customer.lastName", ""] },
          ],
        },
        endDate: 1,
        itemCount: { $size: "$materialInstances" },
        status: 1,
      },
    },
    { $limit: 50 },
  ];

  const baseMatch = {
    organizationId: orgId,
    locationId: locationId,
  };

  // Overdue loans
  const overdue = await Loan.aggregate([
    {
      $match: {
        ...baseMatch,
        status: "overdue",
      },
    },
    { $sort: { endDate: 1 } },
    ...basePipeline,
  ]);

  // Due today
  const dueToday = await Loan.aggregate([
    {
      $match: {
        ...baseMatch,
        status: { $in: ["active", "overdue"] },
        endDate: { $gte: todayStart, $lte: todayEnd },
      },
    },
    { $sort: { endDate: 1 } },
    ...basePipeline,
  ]);

  // Due tomorrow
  const dueTomorrow = await Loan.aggregate([
    {
      $match: {
        ...baseMatch,
        status: "active",
        endDate: { $gte: tomorrowStart, $lte: tomorrowEnd },
      },
    },
    { $sort: { endDate: 1 } },
    ...basePipeline,
  ]);

  return { overdue, dueToday, dueTomorrow };
}

/* ================================================================
 * 7. DAMAGE RESOLUTION QUEUE
 * ================================================================ */

async function getDamageQueue(
  orgId: Types.ObjectId,
  locationId: Types.ObjectId,
  skipValidation = false,
): Promise<DamageResolutionResult> {
  if (!skipValidation) await validateLocationBelongsToOrg(orgId, locationId);

  // Find inspections with damaged items whose instances are at this location
  const [damagesByCategory] = await Inspection.aggregate([
    {
      $match: {
        organizationId: orgId,
      },
    },
    // Early location pre-filter via loan lookup (avoids full-org collection scan)
    {
      $lookup: {
        from: "loans",
        let: { loanId: "$loanId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$loanId"] },
                  { $eq: ["$locationId", locationId] },
                ],
              },
            },
          },
          { $project: { _id: 1 } },
          { $limit: 1 },
        ],
        as: "loanAtLocation",
      },
    },
    { $match: { "loanAtLocation.0": { $exists: true } } },
    { $unwind: "$items" },
    {
      $match: {
        "items.conditionAfter": { $in: ["damaged", "lost", "poor"] },
      },
    },
    // Lookup instance to confirm current physical location
    {
      $lookup: {
        from: "materialinstances",
        localField: "items.materialInstanceId",
        foreignField: "_id",
        as: "instance",
      },
    },
    { $unwind: "$instance" },
    { $match: { "instance.locationId": locationId } },
    // Lookup material type name
    {
      $lookup: {
        from: "materialtypes",
        localField: "instance.modelId",
        foreignField: "_id",
        as: "materialType",
      },
    },
    { $unwind: { path: "$materialType", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        inspectionId: "$_id",
        loanId: 1,
        instanceId: "$items.materialInstanceId",
        serialNumber: "$instance.serialNumber",
        materialTypeName: { $ifNull: ["$materialType.name", "Unknown"] },
        conditionAfter: "$items.conditionAfter",
        damageDescription: { $ifNull: ["$items.damageDescription", ""] },
        estimatedRepairCost: { $ifNull: ["$items.estimatedRepairCost", 0] },
        chargeToCustomer: { $ifNull: ["$items.chargeToCustomer", 0] },
        inspectionStatus: "$status",
        repairRequired: "$items.repairRequired",
        transitionedToStatus: "$items.transitionedToStatus",
        invoiceId: 1,
      },
    },
    {
      $facet: {
        pendingAssessment: [
          { $match: { inspectionStatus: { $in: ["pending", "in_progress"] } } },
          { $sort: { estimatedRepairCost: -1 } },
          { $limit: 100 },
        ],
        pendingRepair: [
          {
            $match: {
              inspectionStatus: "completed",
              repairRequired: true,
              transitionedToStatus: { $in: ["maintenance", "damaged"] },
            },
          },
          { $sort: { estimatedRepairCost: -1 } },
          { $limit: 100 },
        ],
        pendingBilling: [
          {
            $match: {
              inspectionStatus: "completed",
              chargeToCustomer: { $gt: 0 },
              invoiceId: { $exists: false },
            },
          },
          { $sort: { chargeToCustomer: -1 } },
          { $limit: 100 },
        ],
      },
    },
  ]);

  const { pendingAssessment, pendingRepair, pendingBilling } =
    damagesByCategory;

  return { pendingAssessment, pendingRepair, pendingBilling };
}

/* ================================================================
 * 8. GLOBAL TASK AGGREGATOR
 * ================================================================ */

async function getTasks(
  orgId: Types.ObjectId,
  locationId: Types.ObjectId,
): Promise<TaskItem[]> {
  // Validate once; sub-functions receive pre-validated inputs
  await validateLocationBelongsToOrg(orgId, locationId);

  // Run all domain checks in parallel — location already validated above
  const [overview, inspections, financials, transfers, deadlines, damages] =
    await Promise.all([
      getOverview(orgId, locationId, true),
      getInspectionQueue(orgId, locationId, true),
      getOverdueFinancials(orgId, locationId, true),
      getTransferQueue(orgId, locationId, true),
      getLoanDeadlines(orgId, locationId, true),
      getDamageQueue(orgId, locationId, true),
    ]);

  const tasks: TaskItem[] = [];

  // High priority — blocking operations
  if (deadlines.overdue.length > 0) {
    tasks.push({
      type: "overdue_loan",
      priority: "high",
      count: deadlines.overdue.length,
      action: "GET /locations/:locationId/operations/loans/deadlines",
    });
  }
  if (overview.inventory.itemsMissing > 0) {
    tasks.push({
      type: "missing_items",
      priority: "high",
      count: overview.inventory.itemsMissing,
      action: "GET /locations/:locationId/operations/inventory/issues",
    });
  }
  if (financials.overdueInvoices.length > 0) {
    tasks.push({
      type: "overdue_invoice",
      priority: "high",
      count: financials.overdueInvoices.length,
      action: "GET /locations/:locationId/operations/financials/overdue",
    });
  }

  // Medium priority — pending actions
  if (inspections.length > 0) {
    tasks.push({
      type: "inspection_pending",
      priority: "medium",
      count: inspections.length,
      action: "GET /locations/:locationId/operations/inspections",
    });
  }
  if (damages.pendingAssessment.length > 0) {
    tasks.push({
      type: "damage_assessment",
      priority: "medium",
      count: damages.pendingAssessment.length,
      action: "GET /locations/:locationId/operations/damages",
    });
  }
  if (damages.pendingBilling.length > 0) {
    tasks.push({
      type: "damage_billing",
      priority: "medium",
      count: damages.pendingBilling.length,
      action: "GET /locations/:locationId/operations/damages",
    });
  }
  if (transfers.incomingToReceive.length > 0) {
    tasks.push({
      type: "transfer_receive",
      priority: "medium",
      count: transfers.incomingToReceive.length,
      action: "GET /locations/:locationId/operations/transfers",
    });
  }
  if (transfers.pendingApproval.length > 0) {
    tasks.push({
      type: "transfer_approval",
      priority: "medium",
      count: transfers.pendingApproval.length,
      action: "GET /locations/:locationId/operations/transfers",
    });
  }
  if (deadlines.dueToday.length > 0) {
    tasks.push({
      type: "loan_due_today",
      priority: "medium",
      count: deadlines.dueToday.length,
      action: "GET /locations/:locationId/operations/loans/deadlines",
    });
  }
  if (financials.pendingDepositRefunds.length > 0) {
    tasks.push({
      type: "deposit_refund",
      priority: "medium",
      count: financials.pendingDepositRefunds.length,
      action: "GET /locations/:locationId/operations/financials/overdue",
    });
  }

  // Low priority — informational
  if (deadlines.dueTomorrow.length > 0) {
    tasks.push({
      type: "loan_due_tomorrow",
      priority: "low",
      count: deadlines.dueTomorrow.length,
      action: "GET /locations/:locationId/operations/loans/deadlines",
    });
  }
  if (transfers.outgoingToSend.length > 0) {
    tasks.push({
      type: "transfer_send",
      priority: "low",
      count: transfers.outgoingToSend.length,
      action: "GET /locations/:locationId/operations/transfers",
    });
  }
  if (damages.pendingRepair.length > 0) {
    tasks.push({
      type: "damage_repair",
      priority: "low",
      count: damages.pendingRepair.length,
      action: "GET /locations/:locationId/operations/damages",
    });
  }

  // Sort by priority (high → medium → low)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return tasks;
}

/* ---------- Export ---------- */

export const operationsService = {
  getOverview,
  getInspectionQueue,
  getOverdueFinancials,
  getInventoryIssues,
  getTransferQueue,
  getLoanDeadlines,
  getDamageQueue,
  getTasks,
};

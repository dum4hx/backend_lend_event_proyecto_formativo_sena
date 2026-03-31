import { Types } from "mongoose";
import { Loan } from "../loan/models/loan.model.ts";
import { Customer } from "../customer/models/customer.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { MaterialModel } from "../material/models/material_type.model.ts";
import { Invoice } from "../invoice/models/invoice.model.ts";
import { Inspection } from "../inspection/models/inspection.model.ts";
import { Transfer } from "../transfer/models/transfer.model.ts";

interface ReportFilters {
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  status?: string | undefined;
  locationId?: string | undefined;
  customerId?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

function buildDateFilter(filters: ReportFilters) {
  const dateFilter: Record<string, any> = {};
  if (filters.startDate) dateFilter.$gte = filters.startDate;
  if (filters.endDate) dateFilter.$lte = filters.endDate;
  return Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
}

export const reportsService = {
  /**
   * Loan report: lists loans with full detail and computed fields (duration, overdue days).
   */
  async getLoanReport(
    organizationId: Types.ObjectId | string,
    filters: ReportFilters,
  ) {
    const { page = 1, limit = 50, status, customerId } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const query: Record<string, any> = { organizationId };
    const dateFilter = buildDateFilter(filters);
    if (dateFilter) query.createdAt = dateFilter;
    if (status) query.status = status;
    if (customerId) query.customerId = new Types.ObjectId(customerId);

    const [loans, total] = await Promise.all([
      Loan.find(query)
        .skip(skip)
        .limit(Number(limit))
        .populate("customerId", "name email documentNumber")
        .sort({ createdAt: -1 })
        .lean(),
      Loan.countDocuments(query),
    ]);

    const now = new Date();
    const rows = loans.map((loan: any) => {
      const start = new Date(loan.startDate);
      const end = new Date(loan.endDate);
      const durationDays = Math.ceil(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );
      const overdueDays =
        loan.status === "overdue"
          ? Math.ceil(
              (now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24),
            )
          : 0;

      return {
        loanId: loan._id,
        customer: loan.customerId,
        status: loan.status,
        startDate: loan.startDate,
        endDate: loan.endDate,
        returnedAt: loan.returnedAt ?? null,
        durationDays,
        overdueDays,
        totalAmount: loan.totalAmount ?? 0,
        depositAmount: loan.deposit?.amount ?? 0,
        depositStatus: loan.deposit?.status ?? "not_required",
        materialCount: loan.materialInstances?.length ?? 0,
      };
    });

    // Summary aggregation
    const summary = await Loan.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalLoans: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          avgDuration: {
            $avg: {
              $divide: [
                { $subtract: ["$endDate", "$startDate"] },
                1000 * 60 * 60 * 24,
              ],
            },
          },
          statusCounts: { $push: "$status" },
        },
      },
    ]);

    const summaryData = summary[0] ?? {
      totalLoans: 0,
      totalRevenue: 0,
      avgDuration: 0,
    };

    return {
      rows,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      summary: {
        totalLoans: summaryData.totalLoans,
        totalRevenue: summaryData.totalRevenue,
        averageDurationDays: Math.round(summaryData.avgDuration ?? 0),
      },
    };
  },

  /**
   * Inventory report: stock levels per material type and location,
   * with status breakdown.
   */
  async getInventoryReport(
    organizationId: Types.ObjectId | string,
    filters: ReportFilters,
  ) {
    const match: Record<string, any> = { organizationId };
    if (filters.locationId)
      match.locationId = new Types.ObjectId(filters.locationId);
    if (filters.status) match.status = filters.status;

    const byType = await MaterialInstance.aggregate([
      { $match: match },
      {
        $group: {
          _id: { modelId: "$modelId", status: "$status" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.modelId",
          total: { $sum: "$count" },
          statuses: {
            $push: { status: "$_id.status", count: "$count" },
          },
        },
      },
      {
        $lookup: {
          from: "materials",
          localField: "_id",
          foreignField: "_id",
          as: "materialType",
        },
      },
      { $unwind: { path: "$materialType", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          materialTypeId: "$_id",
          materialTypeName: "$materialType.name",
          total: 1,
          statuses: 1,
        },
      },
      { $sort: { materialTypeName: 1 } },
    ]);

    const byLocation = await MaterialInstance.aggregate([
      { $match: match },
      {
        $group: {
          _id: { locationId: "$locationId", status: "$status" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.locationId",
          total: { $sum: "$count" },
          statuses: {
            $push: { status: "$_id.status", count: "$count" },
          },
        },
      },
      {
        $lookup: {
          from: "locations",
          localField: "_id",
          foreignField: "_id",
          as: "location",
        },
      },
      { $unwind: { path: "$location", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          locationId: "$_id",
          locationName: "$location.name",
          total: 1,
          statuses: 1,
        },
      },
      { $sort: { locationName: 1 } },
    ]);

    const totalInstances = await MaterialInstance.countDocuments(match);

    return {
      totalInstances,
      byMaterialType: byType,
      byLocation,
    };
  },

  /**
   * Financial report: invoice summary with totals by type and status,
   * plus individual invoice rows.
   */
  async getFinancialReport(
    organizationId: Types.ObjectId | string,
    filters: ReportFilters,
  ) {
    const { page = 1, limit = 50, status } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const query: Record<string, any> = { organizationId };
    const dateFilter = buildDateFilter(filters);
    if (dateFilter) query.createdAt = dateFilter;
    if (status) query.status = status;

    const [invoices, total, summaryByType, summaryByStatus] = await Promise.all(
      [
        Invoice.find(query)
          .skip(skip)
          .limit(Number(limit))
          .populate("customerId", "name email")
          .sort({ createdAt: -1 })
          .lean(),
        Invoice.countDocuments(query),
        Invoice.aggregate([
          { $match: query },
          {
            $group: {
              _id: "$type",
              totalAmount: { $sum: "$totalAmount" },
              totalPaid: { $sum: "$amountPaid" },
              totalDue: { $sum: "$amountDue" },
              count: { $sum: 1 },
            },
          },
          { $sort: { totalAmount: -1 } },
        ]),
        Invoice.aggregate([
          { $match: query },
          {
            $group: {
              _id: "$status",
              totalAmount: { $sum: "$totalAmount" },
              count: { $sum: 1 },
            },
          },
        ]),
      ],
    );

    const rows = invoices.map((inv: any) => ({
      invoiceId: inv._id,
      type: inv.type,
      status: inv.status,
      customer: inv.customerId,
      totalAmount: inv.totalAmount,
      amountPaid: inv.amountPaid,
      amountDue: inv.amountDue,
      dueDate: inv.dueDate,
      createdAt: inv.createdAt,
    }));

    return {
      rows,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      summaryByType: summaryByType.map((s: any) => ({
        type: s._id,
        totalAmount: s.totalAmount,
        totalPaid: s.totalPaid,
        totalDue: s.totalDue,
        count: s.count,
      })),
      summaryByStatus: summaryByStatus.map((s: any) => ({
        status: s._id,
        totalAmount: s.totalAmount,
        count: s.count,
      })),
    };
  },

  /**
   * Damage & repairs report: inspection damage items with status and financials.
   */
  async getDamageReport(
    organizationId: Types.ObjectId | string,
    filters: ReportFilters,
  ) {
    const match: Record<string, any> = { organizationId };
    const dateFilter = buildDateFilter(filters);
    if (dateFilter) match.createdAt = dateFilter;

    const inspections = await Inspection.find(match)
      .populate("loanId", "customerId startDate endDate")
      .lean();

    const damageItems: any[] = [];

    for (const inspection of inspections) {
      for (const item of inspection.items) {
        if (
          item.conditionAfter === "damaged" ||
          item.conditionAfter === "lost"
        ) {
          damageItems.push({
            inspectionId: inspection._id,
            loanId: inspection.loanId,
            materialInstanceId: item.materialInstanceId,
            conditionBefore: item.conditionBefore,
            conditionAfter: item.conditionAfter,
            damageDescription: item.damageDescription ?? null,
            chargeToCustomer: item.chargeToCustomer ?? 0,
            estimatedRepairCost: item.estimatedRepairCost ?? 0,
            inspectedAt: inspection.createdAt,
          });
        }
      }
    }

    const totalDamageCost = damageItems.reduce(
      (sum, item) => sum + item.chargeToCustomer,
      0,
    );
    const totalRepairCost = damageItems.reduce(
      (sum, item) => sum + item.estimatedRepairCost,
      0,
    );

    return {
      totalDamageItems: damageItems.length,
      totalDamageCost,
      totalRepairCost,
      items: damageItems,
    };
  },

  /**
   * Transfer report: summary of inter-location transfers.
   */
  async getTransferReport(
    organizationId: Types.ObjectId | string,
    filters: ReportFilters,
  ) {
    const query: Record<string, any> = { organizationId };
    const dateFilter = buildDateFilter(filters);
    if (dateFilter) query.createdAt = dateFilter;
    if (filters.status) query.status = filters.status;

    const { page = 1, limit = 50 } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const [transfers, total, summary] = await Promise.all([
      Transfer.find(query)
        .skip(skip)
        .limit(Number(limit))
        .populate("fromLocationId", "name")
        .populate("toLocationId", "name")
        .sort({ createdAt: -1 })
        .lean(),
      Transfer.countDocuments(query),
      Transfer.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalItems: { $sum: { $size: "$items" } },
          },
        },
      ]),
    ]);

    return {
      rows: transfers.map((t: any) => ({
        transferId: t._id,
        status: t.status,
        origin: t.fromLocationId,
        destination: t.toLocationId,
        itemCount: t.items?.length ?? 0,
        createdAt: t.createdAt,
        receivedAt: t.receivedAt ?? null,
      })),
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      summaryByStatus: summary.map((s: any) => ({
        status: s._id,
        count: s.count,
        totalItems: s.totalItems,
      })),
    };
  },
};

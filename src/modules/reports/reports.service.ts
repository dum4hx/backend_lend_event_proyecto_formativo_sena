import { Types } from "mongoose";
import { Loan } from "../loan/models/loan.model.ts";
import { Customer } from "../customer/models/customer.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { MaterialModel } from "../material/models/material_type.model.ts";
import { Invoice } from "../invoice/models/invoice.model.ts";
import { Inspection } from "../inspection/models/inspection.model.ts";
import { Transfer } from "../transfer/models/transfer.model.ts";
import { MaintenanceBatch } from "../maintenance/models/maintenance_batch.model.ts";
import { Category } from "../material/models/category.model.ts";
import { materialService } from "../material/material.service.ts";
import { BillingEvent } from "../billing/models/billing_event.model.ts";
import { Organization } from "../organization/models/organization.model.ts";
import { Location } from "../location/models/location.model.ts";
import { LoanRequest } from "../request/models/request.model.ts";

interface ReportFilters {
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  status?: string | undefined;
  locationId?: string | undefined;
  customerId?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

/* ---------- Export-specific filter interfaces ---------- */

interface SalesExportFilters {
  startDate?: Date;
  endDate?: Date;
  customerId?: string;
  locationId?: string;
  invoiceType?: string;
  invoiceStatus?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
  includeIds?: boolean;
}

interface CatalogDetailedExportFilters {
  categoryId?: string;
  locationId?: string;
  search?: string;
  status?: string;
  includeIds?: boolean;
}

interface LoanActivityExportFilters {
  startDate?: Date;
  endDate?: Date;
  customerId?: string;
  locationId?: string;
  status?: string;
  page?: number;
  limit?: number;
  includeIds?: boolean;
}

interface DamageExportFilters {
  startDate?: Date;
  endDate?: Date;
  locationId?: string;
  entryReason?: string;
  batchStatus?: string;
  page?: number;
  limit?: number;
  includeIds?: boolean;
}

interface InventoryExportFilters {
  locationId?: string;
  categoryId?: string;
  status?: string;
  search?: string;
  includeIds?: boolean;
}

interface TransferExportFilters {
  startDate?: Date;
  endDate?: Date;
  status?: string;
  fromLocationId?: string;
  toLocationId?: string;
  page?: number;
  limit?: number;
  includeIds?: boolean;
}

interface BillingHistoryExportFilters {
  startDate?: Date;
  endDate?: Date;
  eventType?: string;
  page?: number;
  limit?: number;
  includeIds?: boolean;
}

interface LocationExportFilters {
  locationId?: string;
  status?: string;
  isActive?: boolean;
  search?: string;
  includeIds?: boolean;
}

interface CustomerExportFilters {
  status?: string;
  search?: string;
  documentType?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  includeIds?: boolean;
}

interface RequestExportFilters {
  createdAtStart?: Date;
  createdAtEnd?: Date;
  loanStartFrom?: Date;
  loanStartTo?: Date;
  status?: string;
  customerId?: string;
  page?: number;
  limit?: number;
  includeIds?: boolean;
}

function buildDateFilter(filters: ReportFilters) {
  const dateFilter: Record<string, any> = {};
  if (filters.startDate) dateFilter.$gte = filters.startDate;
  if (filters.endDate) dateFilter.$lte = filters.endDate;
  return Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
}

/**
 * Compute the previous period of equal duration for comparison.
 * If startDate and endDate are provided, the previous period goes from
 * (startDate - duration) to (startDate - 1 day).
 */
function computePreviousPeriod(startDate?: Date, endDate?: Date) {
  if (!startDate || !endDate) return undefined;
  const durationMs = endDate.getTime() - startDate.getTime();
  const previousEnd = new Date(startDate.getTime() - 86_400_000); // day before start
  const previousStart = new Date(previousEnd.getTime() - durationMs);
  return { previousStart, previousEnd };
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

/** Remove fields ending in Id or _id from a plain object (shallow). */
function stripIds(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "_id" || (k.endsWith("Id") && k !== "includeIds")) continue;
    out[k] = v;
  }
  return out;
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
          ? Math.ceil((now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24))
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
          from: "materialtypes",
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

  /**
   * Catalog export: returns all material types with stock levels, metrics, and alerts.
   * Fetches all pages from getCatalogOverview (no pagination limit) for a full export.
   */
  async getCatalogExport(
    organizationId: Types.ObjectId | string,
    opts: {
      locationId?: string;
      categoryId?: string;
      search?: string;
    } = {},
  ) {
    // Fetch all rows in one pass using a high limit
    const result = await materialService.getCatalogOverview({
      organizationId,
      ...opts,
      page: 1,
      limit: 10_000,
    });

    return {
      exportedAt: new Date(),
      totalMaterialTypes: result.summary.totalMaterialTypes,
      filters: opts,
      materialTypes: result.materialTypes,
    };
  },

  /* ================================================================
   *  NEW EXPORT ENDPOINTS
   * ================================================================ */

  /**
   * Sales export: combined Loan revenue + Invoice data with optional
   * business metrics and period-over-period comparison.
   */
  async getSalesExport(
    organizationId: Types.ObjectId | string,
    filters: SalesExportFilters,
  ) {
    const {
      page = 1,
      limit = 50,
      includeIds = true,
      customerId,
      locationId,
      invoiceType,
      invoiceStatus,
      categoryId,
    } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    /* --- Loan query --- */
    const loanQuery: Record<string, any> = { organizationId };
    if (filters.startDate || filters.endDate) {
      const df: Record<string, any> = {};
      if (filters.startDate) df.$gte = filters.startDate;
      if (filters.endDate) df.$lte = filters.endDate;
      loanQuery.createdAt = df;
    }
    if (customerId) loanQuery.customerId = new Types.ObjectId(customerId);
    if (locationId) loanQuery.locationId = new Types.ObjectId(locationId);

    // If categoryId filter provided, get materialTypeIds belonging to that category
    if (categoryId) {
      const typeIds = await MaterialModel.find({
        organizationId,
        categoryId: new Types.ObjectId(categoryId),
      })
        .distinct("_id")
        .lean();
      loanQuery["materialInstances.materialTypeId"] = { $in: typeIds };
    }

    /* --- Invoice query --- */
    const invoiceQuery: Record<string, any> = { organizationId };
    if (filters.startDate || filters.endDate) {
      const df: Record<string, any> = {};
      if (filters.startDate) df.$gte = filters.startDate;
      if (filters.endDate) df.$lte = filters.endDate;
      invoiceQuery.createdAt = df;
    }
    if (customerId) invoiceQuery.customerId = new Types.ObjectId(customerId);
    if (invoiceType) invoiceQuery.type = invoiceType;
    if (invoiceStatus) invoiceQuery.status = invoiceStatus;

    const [loans, loanTotal, invoices, invoiceTotal] = await Promise.all([
      Loan.find(loanQuery)
        .skip(skip)
        .limit(Number(limit))
        .populate("customerId", "name email")
        .populate("locationId", "name")
        .sort({ createdAt: -1 })
        .lean(),
      Loan.countDocuments(loanQuery),
      Invoice.find(invoiceQuery)
        .skip(skip)
        .limit(Number(limit))
        .populate("customerId", "name email")
        .sort({ createdAt: -1 })
        .lean(),
      Invoice.countDocuments(invoiceQuery),
    ]);

    const total = Math.max(loanTotal, invoiceTotal);

    const loanRows = loans.map((l: any) => ({
      ...(includeIds
        ? {
            loanId: l._id,
            customerId: l.customerId?._id,
            locationId: l.locationId?._id,
          }
        : {}),
      code: l.code,
      customerName: l.customerId
        ? `${l.customerId.name?.firstName ?? ""} ${l.customerId.name?.firstSurname ?? ""}`.trim()
        : null,
      customerEmail: l.customerId?.email ?? null,
      locationName: l.locationId?.name ?? null,
      startDate: l.startDate,
      endDate: l.endDate,
      totalAmount: l.totalAmount ?? 0,
      depositAmount: l.deposit?.amount ?? 0,
      status: l.status,
      materialCount: l.materialInstances?.length ?? 0,
    }));

    const invoiceRows = invoices.map((inv: any) => ({
      ...(includeIds
        ? {
            invoiceId: inv._id,
            customerId: inv.customerId?._id,
          }
        : {}),
      invoiceNumber: inv.invoiceNumber,
      type: inv.type,
      status: inv.status,
      customerName: inv.customerId
        ? `${inv.customerId.name?.firstName ?? ""} ${inv.customerId.name?.firstSurname ?? ""}`.trim()
        : null,
      totalAmount: inv.totalAmount,
      amountPaid: inv.amountPaid,
      amountDue: inv.amountDue,
      dueDate: inv.dueDate,
      createdAt: inv.createdAt,
    }));

    const result: Record<string, any> = {
      loanRows,
      invoiceRows,
      pagination: {
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };

    /* --- Enriched summary when includeIds=false --- */
    if (!includeIds) {
      const [loanAgg, invoiceAgg, monthlyLoan, monthlyInvoice, topCustomers] =
        await Promise.all([
          Loan.aggregate([
            { $match: loanQuery },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$totalAmount" },
                count: { $sum: 1 },
              },
            },
          ]),
          Invoice.aggregate([
            { $match: invoiceQuery },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$totalAmount" },
                count: { $sum: 1 },
              },
            },
          ]),
          Loan.aggregate([
            { $match: loanQuery },
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                loanRevenue: { $sum: "$totalAmount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ]),
          Invoice.aggregate([
            { $match: invoiceQuery },
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                invoiceRevenue: { $sum: "$totalAmount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ]),
          Loan.aggregate([
            { $match: loanQuery },
            {
              $group: {
                _id: "$customerId",
                totalRevenue: { $sum: "$totalAmount" },
                loanCount: { $sum: 1 },
              },
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: "customers",
                localField: "_id",
                foreignField: "_id",
                as: "customer",
              },
            },
            {
              $unwind: {
                path: "$customer",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                _id: 0,
                customerName: {
                  $concat: [
                    { $ifNull: ["$customer.name.firstName", ""] },
                    " ",
                    { $ifNull: ["$customer.name.firstSurname", ""] },
                  ],
                },
                totalRevenue: 1,
                loanCount: 1,
              },
            },
          ]),
        ]);

      const revenueByInvoiceType = await Invoice.aggregate([
        { $match: invoiceQuery },
        {
          $group: {
            _id: "$type",
            revenue: { $sum: "$totalAmount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { revenue: -1 } },
      ]);

      const totalLoanRevenue = loanAgg[0]?.totalRevenue ?? 0;
      const totalInvoiceRevenue = invoiceAgg[0]?.totalRevenue ?? 0;
      const loanCount = loanAgg[0]?.count ?? 0;

      // Merge monthly data
      const monthMap = new Map<string, any>();
      for (const m of monthlyLoan) {
        const key = `${m._id.year}-${m._id.month}`;
        monthMap.set(key, {
          year: m._id.year,
          month: m._id.month,
          loanRevenue: m.loanRevenue,
          invoiceRevenue: 0,
          total: m.loanRevenue,
        });
      }
      for (const m of monthlyInvoice) {
        const key = `${m._id.year}-${m._id.month}`;
        const existing = monthMap.get(key) ?? {
          year: m._id.year,
          month: m._id.month,
          loanRevenue: 0,
          invoiceRevenue: 0,
          total: 0,
        };
        existing.invoiceRevenue = m.invoiceRevenue;
        existing.total = existing.loanRevenue + m.invoiceRevenue;
        monthMap.set(key, existing);
      }
      const revenueByMonth = [...monthMap.values()].sort(
        (a, b) => a.year - b.year || a.month - b.month,
      );

      // Period comparison
      let periodComparison: Record<string, any> | undefined;
      const prev = computePreviousPeriod(filters.startDate, filters.endDate);
      if (prev) {
        const prevLoanQuery = {
          ...loanQuery,
          createdAt: { $gte: prev.previousStart, $lte: prev.previousEnd },
        };
        const prevInvoiceQuery = {
          ...invoiceQuery,
          createdAt: { $gte: prev.previousStart, $lte: prev.previousEnd },
        };
        const [prevLoan, prevInvoice] = await Promise.all([
          Loan.aggregate([
            { $match: prevLoanQuery },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ]),
          Invoice.aggregate([
            { $match: prevInvoiceQuery },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ]),
        ]);
        const previousTotal =
          (prevLoan[0]?.total ?? 0) + (prevInvoice[0]?.total ?? 0);
        const currentTotal = totalLoanRevenue + totalInvoiceRevenue;
        periodComparison = {
          currentTotal,
          previousTotal,
          percentChange: pctChange(currentTotal, previousTotal),
        };
      }

      result.summary = {
        totalLoanRevenue,
        totalInvoiceRevenue,
        combinedRevenue: totalLoanRevenue + totalInvoiceRevenue,
        averageLoanValue:
          loanCount > 0 ? Math.round(totalLoanRevenue / loanCount) : 0,
        revenueByMonth,
        revenueByInvoiceType: revenueByInvoiceType.map((r: any) => ({
          type: r._id,
          revenue: r.revenue,
          count: r.count,
        })),
        topCustomersByRevenue: topCustomers,
        ...(periodComparison ? { periodComparison } : {}),
      };
    }

    return result;
  },

  /**
   * Catalog detailed export: material types with instance breakdown, per-location
   * counts, and enriched metrics when includeIds=false.
   */
  async getCatalogDetailedExport(
    organizationId: Types.ObjectId | string,
    filters: CatalogDetailedExportFilters,
  ) {
    const {
      includeIds = true,
      categoryId,
      locationId,
      search,
      status,
    } = filters;

    /* --- Material type query --- */
    const mtQuery: Record<string, any> = { organizationId };
    if (categoryId) mtQuery.categoryId = new Types.ObjectId(categoryId);
    if (search) mtQuery.name = { $regex: search, $options: "i" };

    const materialTypes = await MaterialModel.find(mtQuery)
      .populate("categoryId", "name")
      .lean();

    /* --- Instance aggregation per material type --- */
    const instanceMatch: Record<string, any> = { organizationId };
    if (locationId) instanceMatch.locationId = new Types.ObjectId(locationId);
    if (status) instanceMatch.status = status;

    const instanceAgg = await MaterialInstance.aggregate([
      { $match: instanceMatch },
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
          statuses: { $push: { status: "$_id.status", count: "$count" } },
        },
      },
    ]);

    const instanceByLocation = await MaterialInstance.aggregate([
      { $match: instanceMatch },
      {
        $group: {
          _id: { modelId: "$modelId", locationId: "$locationId" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.modelId",
          locations: {
            $push: { locationId: "$_id.locationId", count: "$count" },
          },
        },
      },
      {
        $unwind: "$locations",
      },
      {
        $lookup: {
          from: "locations",
          localField: "locations.locationId",
          foreignField: "_id",
          as: "loc",
        },
      },
      { $unwind: { path: "$loc", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$_id",
          locations: {
            $push: {
              locationName: "$loc.name",
              locationId: "$locations.locationId",
              count: "$locations.count",
            },
          },
        },
      },
    ]);

    // Build lookup maps
    const instanceMap = new Map<string, any>();
    for (const entry of instanceAgg) {
      instanceMap.set(entry._id.toString(), entry);
    }
    const locationMap = new Map<string, any[]>();
    for (const entry of instanceByLocation) {
      locationMap.set(
        entry._id.toString(),
        entry.locations.map((l: any) =>
          includeIds ? l : { locationName: l.locationName, count: l.count },
        ),
      );
    }

    // Fetch enriched metrics only when includeIds=false
    let revenueMap = new Map<
      string,
      { totalRevenue: number; totalLoans: number; avgDurationDays: number }
    >();
    let maintenanceCostMap = new Map<string, number>();

    if (!includeIds) {
      // Revenue from loan pricingSnapshot
      const revenueAgg = await Loan.aggregate([
        { $match: { organizationId } },
        { $unwind: "$pricingSnapshot" },
        {
          $group: {
            _id: "$pricingSnapshot.referenceId",
            totalRevenue: { $sum: "$pricingSnapshot.totalPrice" },
            totalLoans: { $addToSet: "$_id" },
            avgDuration: {
              $avg: {
                $divide: [
                  { $subtract: ["$endDate", "$startDate"] },
                  86_400_000,
                ],
              },
            },
          },
        },
        {
          $project: {
            totalRevenue: 1,
            totalLoans: { $size: "$totalLoans" },
            avgDurationDays: { $round: ["$avgDuration", 0] },
          },
        },
      ]);
      for (const r of revenueAgg) {
        revenueMap.set(r._id.toString(), {
          totalRevenue: r.totalRevenue,
          totalLoans: r.totalLoans,
          avgDurationDays: r.avgDurationDays,
        });
      }

      // Maintenance costs by materialType
      const maintAgg = await MaintenanceBatch.aggregate([
        { $match: { organizationId } },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "materialinstances",
            localField: "items.materialInstanceId",
            foreignField: "_id",
            as: "inst",
          },
        },
        { $unwind: { path: "$inst", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$inst.modelId",
            totalCost: {
              $sum: { $ifNull: ["$items.actualCost", "$items.estimatedCost"] },
            },
          },
        },
      ]);
      for (const m of maintAgg) {
        if (m._id) maintenanceCostMap.set(m._id.toString(), m.totalCost);
      }
    }

    const types = materialTypes.map((mt: any) => {
      const mtId = mt._id.toString();
      const instData = instanceMap.get(mtId);
      const total = instData?.total ?? 0;
      const statuses: any[] = instData?.statuses ?? [];
      const statusObj: Record<string, number> = {};
      for (const s of statuses) statusObj[s.status] = s.count;

      const available = statusObj["available"] ?? 0;
      const loaned = statusObj["loaned"] ?? 0;
      const damaged = statusObj["damaged"] ?? 0;

      const base: Record<string, any> = {
        ...(includeIds
          ? {
              materialTypeId: mt._id,
              categoryIds: mt.categoryId?.map?.((c: any) => c._id) ?? [],
            }
          : {}),
        code: mt.code,
        name: mt.name,
        description: mt.description,
        pricePerDay: mt.pricePerDay,
        categoryNames: mt.categoryId?.map?.((c: any) => c.name) ?? [],
        totalInstances: total,
        instancesByStatus: statusObj,
        locationBreakdown: locationMap.get(mtId) ?? [],
      };

      if (!includeIds) {
        const revData = revenueMap.get(mtId);
        base.utilizationRate =
          total > 0 ? Math.round((loaned / total) * 10000) / 100 : 0;
        base.availabilityRate =
          total > 0 ? Math.round((available / total) * 10000) / 100 : 0;
        base.damageRate =
          total > 0 ? Math.round((damaged / total) * 10000) / 100 : 0;
        base.totalRevenue = revData?.totalRevenue ?? 0;
        base.totalLoans = revData?.totalLoans ?? 0;
        base.averageLoanDurationDays = revData?.avgDurationDays ?? 0;
        base.maintenanceCostTotal = maintenanceCostMap.get(mtId) ?? 0;
      }

      return base;
    });

    const result: Record<string, any> = {
      exportedAt: new Date(),
      totalMaterialTypes: types.length,
      materialTypes: types,
    };

    if (!includeIds) {
      const allInstances = instanceAgg.reduce(
        (acc: number, e: any) => acc + e.total,
        0,
      );
      const allAvailable = instanceAgg.reduce((acc: number, e: any) => {
        const av = e.statuses.find((s: any) => s.status === "available");
        return acc + (av?.count ?? 0);
      }, 0);
      const allLoaned = instanceAgg.reduce((acc: number, e: any) => {
        const ln = e.statuses.find((s: any) => s.status === "loaned");
        return acc + (ln?.count ?? 0);
      }, 0);

      // Global status breakdown
      const globalStatusMap: Record<string, number> = {};
      for (const e of instanceAgg) {
        for (const s of e.statuses) {
          globalStatusMap[s.status] =
            (globalStatusMap[s.status] ?? 0) + s.count;
        }
      }

      result.summary = {
        totalCatalogItems: types.length,
        totalInstances: allInstances,
        globalAvailabilityRate:
          allInstances > 0
            ? Math.round((allAvailable / allInstances) * 10000) / 100
            : 0,
        globalUtilizationRate:
          allInstances > 0
            ? Math.round((allLoaned / allInstances) * 10000) / 100
            : 0,
        instancesByStatus: Object.entries(globalStatusMap).map(
          ([status, count]) => ({ status, count }),
        ),
        topRevenueGenerators: [...types]
          .sort((a, b) => (b.totalRevenue ?? 0) - (a.totalRevenue ?? 0))
          .slice(0, 10)
          .map((t) => ({
            name: t.name,
            totalRevenue: t.totalRevenue ?? 0,
            totalLoans: t.totalLoans ?? 0,
          })),
      };
    }

    return result;
  },

  /**
   * Loan activity export: loan detail with trends, overdue/return rates,
   * and period-over-period comparison.
   */
  async getLoanActivityExport(
    organizationId: Types.ObjectId | string,
    filters: LoanActivityExportFilters,
  ) {
    const { page = 1, limit = 50, includeIds = true } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const query: Record<string, any> = { organizationId };
    if (filters.startDate || filters.endDate) {
      const df: Record<string, any> = {};
      if (filters.startDate) df.$gte = filters.startDate;
      if (filters.endDate) df.$lte = filters.endDate;
      query.createdAt = df;
    }
    if (filters.customerId)
      query.customerId = new Types.ObjectId(filters.customerId);
    if (filters.locationId)
      query.locationId = new Types.ObjectId(filters.locationId);
    if (filters.status) query.status = filters.status;

    const [loans, total] = await Promise.all([
      Loan.find(query)
        .skip(skip)
        .limit(Number(limit))
        .populate("customerId", "name email")
        .populate("locationId", "name")
        .sort({ createdAt: -1 })
        .lean(),
      Loan.countDocuments(query),
    ]);

    const now = new Date();
    const rows = loans.map((l: any) => {
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      const durationDays = Math.ceil(
        (end.getTime() - start.getTime()) / 86_400_000,
      );
      const overdueDays =
        l.status === "overdue"
          ? Math.ceil((now.getTime() - end.getTime()) / 86_400_000)
          : 0;

      return {
        ...(includeIds
          ? {
              loanId: l._id,
              customerId: l.customerId?._id,
              locationId: l.locationId?._id,
            }
          : {}),
        code: l.code,
        customerName: l.customerId
          ? `${l.customerId.name?.firstName ?? ""} ${l.customerId.name?.firstSurname ?? ""}`.trim()
          : null,
        locationName: l.locationId?.name ?? null,
        status: l.status,
        startDate: l.startDate,
        endDate: l.endDate,
        returnedAt: l.returnedAt ?? null,
        durationDays,
        overdueDays,
        totalAmount: l.totalAmount ?? 0,
        materialCount: l.materialInstances?.length ?? 0,
      };
    });

    const result: Record<string, any> = {
      rows,
      pagination: {
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };

    if (!includeIds) {
      const [summaryAgg, byMonth, byStatus, topMaterials, topCustomers] =
        await Promise.all([
          Loan.aggregate([
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
                      86_400_000,
                    ],
                  },
                },
                overdueCount: {
                  $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] },
                },
                returnedCount: {
                  $sum: { $cond: [{ $eq: ["$status", "returned"] }, 1, 0] },
                },
                closedCount: {
                  $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] },
                },
              },
            },
          ]),
          Loan.aggregate([
            { $match: query },
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                count: { $sum: 1 },
                totalAmount: { $sum: "$totalAmount" },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ]),
          Loan.aggregate([
            { $match: query },
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                totalAmount: { $sum: "$totalAmount" },
              },
            },
            { $sort: { count: -1 } },
          ]),
          Loan.aggregate([
            { $match: query },
            { $unwind: "$materialInstances" },
            {
              $group: {
                _id: "$materialInstances.materialTypeId",
                loanCount: { $sum: 1 },
              },
            },
            { $sort: { loanCount: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: "materialtypes",
                localField: "_id",
                foreignField: "_id",
                as: "mt",
              },
            },
            { $unwind: { path: "$mt", preserveNullAndEmptyArrays: true } },
            { $project: { _id: 0, materialName: "$mt.name", loanCount: 1 } },
          ]),
          Loan.aggregate([
            { $match: query },
            {
              $group: {
                _id: "$customerId",
                loanCount: { $sum: 1 },
                totalAmount: { $sum: "$totalAmount" },
              },
            },
            { $sort: { loanCount: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: "customers",
                localField: "_id",
                foreignField: "_id",
                as: "cust",
              },
            },
            { $unwind: { path: "$cust", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                customerName: {
                  $concat: [
                    { $ifNull: ["$cust.name.firstName", ""] },
                    " ",
                    { $ifNull: ["$cust.name.firstSurname", ""] },
                  ],
                },
                loanCount: 1,
                totalAmount: 1,
              },
            },
          ]),
        ]);

      const s = summaryAgg[0] ?? {
        totalLoans: 0,
        totalRevenue: 0,
        avgDuration: 0,
        overdueCount: 0,
        returnedCount: 0,
        closedCount: 0,
      };

      const summary: Record<string, any> = {
        totalLoans: s.totalLoans,
        totalRevenue: s.totalRevenue,
        averageDurationDays: Math.round(s.avgDuration ?? 0),
        overdueRate:
          s.totalLoans > 0
            ? Math.round((s.overdueCount / s.totalLoans) * 10000) / 100
            : 0,
        returnRate:
          s.totalLoans > 0
            ? Math.round(
                ((s.returnedCount + s.closedCount) / s.totalLoans) * 10000,
              ) / 100
            : 0,
        loansByMonth: byMonth.map((m: any) => ({
          year: m._id.year,
          month: m._id.month,
          count: m.count,
          totalAmount: m.totalAmount,
        })),
        loansByStatus: byStatus.map((st: any) => ({
          status: st._id,
          count: st.count,
          totalAmount: st.totalAmount,
        })),
        topMaterials,
        topCustomers,
      };

      // Period comparison
      const prev = computePreviousPeriod(filters.startDate, filters.endDate);
      if (prev) {
        const prevQuery = {
          ...query,
          createdAt: { $gte: prev.previousStart, $lte: prev.previousEnd },
        };
        const [prevAgg] = await Promise.all([
          Loan.aggregate([
            { $match: prevQuery },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                revenue: { $sum: "$totalAmount" },
              },
            },
          ]),
        ]);
        const p = prevAgg[0] ?? { count: 0, revenue: 0 };
        summary.periodComparison = {
          currentCount: s.totalLoans,
          previousCount: p.count,
          percentChange: pctChange(s.totalLoans, p.count),
          currentRevenue: s.totalRevenue,
          previousRevenue: p.revenue,
          revenuePercentChange: pctChange(s.totalRevenue, p.revenue),
        };
      }

      result.summary = summary;
    }

    return result;
  },

  /**
   * Damage & maintenance export: maintenance batches with items breakdown,
   * cost analysis, and period comparison.
   */
  async getDamageExport(
    organizationId: Types.ObjectId | string,
    filters: DamageExportFilters,
  ) {
    const { page = 1, limit = 50, includeIds = true } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const query: Record<string, any> = { organizationId };
    if (filters.startDate || filters.endDate) {
      const df: Record<string, any> = {};
      if (filters.startDate) df.$gte = filters.startDate;
      if (filters.endDate) df.$lte = filters.endDate;
      query.createdAt = df;
    }
    if (filters.locationId)
      query.locationId = new Types.ObjectId(filters.locationId);
    if (filters.batchStatus) query.status = filters.batchStatus;

    // Item-level filter for entryReason
    const hasEntryReasonFilter = !!filters.entryReason;

    const [batches, total] = await Promise.all([
      MaintenanceBatch.find(query)
        .skip(skip)
        .limit(Number(limit))
        .populate("locationId", "name")
        .populate("assignedTo", "name email")
        .populate("items.materialInstanceId", "serialNumber modelId")
        .sort({ createdAt: -1 })
        .lean(),
      MaintenanceBatch.countDocuments(query),
    ]);

    // Collect instance modelIds for materialType name lookup
    const modelIds = new Set<string>();
    for (const b of batches) {
      for (const item of b.items as any[]) {
        const inst = item.materialInstanceId as any;
        if (inst?.modelId) modelIds.add(inst.modelId.toString());
      }
    }
    const typeNames = new Map<string, string>();
    if (modelIds.size > 0) {
      const types = await MaterialModel.find({
        _id: { $in: [...modelIds].map((id) => new Types.ObjectId(id)) },
      })
        .select("name")
        .lean();
      for (const t of types) typeNames.set(t._id.toString(), t.name);
    }

    const batchRows = batches.map((b: any) => ({
      ...(includeIds ? { batchId: b._id, locationId: b.locationId?._id } : {}),
      batchNumber: b.batchNumber,
      name: b.name,
      status: b.status,
      locationName: b.locationId?.name ?? null,
      assignedTo: b.assignedTo
        ? `${b.assignedTo.name?.firstName ?? ""} ${b.assignedTo.name?.firstSurname ?? ""}`.trim()
        : null,
      totalEstimatedCost: b.totalEstimatedCost,
      totalActualCost: b.totalActualCost,
      startedAt: b.startedAt ?? null,
      completedAt: b.completedAt ?? null,
      itemCount: b.items?.length ?? 0,
    }));

    const allItems: any[] = [];
    for (const b of batches) {
      for (const item of b.items as any[]) {
        if (hasEntryReasonFilter && item.entryReason !== filters.entryReason)
          continue;
        const inst = item.materialInstanceId as any;
        allItems.push({
          ...(includeIds
            ? { materialInstanceId: inst?._id ?? item.materialInstanceId }
            : {}),
          batchNumber: (b as any).batchNumber,
          serialNumber: inst?.serialNumber ?? null,
          materialTypeName: inst?.modelId
            ? (typeNames.get(inst.modelId.toString()) ?? null)
            : null,
          entryReason: item.entryReason,
          itemStatus: item.itemStatus,
          estimatedCost: item.estimatedCost ?? 0,
          actualCost: item.actualCost ?? 0,
          repairNotes: item.repairNotes ?? null,
          sourceType: item.sourceType,
          resolvedAt: item.resolvedAt ?? null,
        });
      }
    }

    const result: Record<string, any> = {
      batches: batchRows,
      items: allItems,
      pagination: {
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };

    if (!includeIds) {
      // Full aggregation over ALL matching batches (not just current page)
      const [
        costAgg,
        costByReason,
        costByMonth,
        mostDamaged,
        repairTime,
        resolutionAgg,
      ] = await Promise.all([
        MaintenanceBatch.aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalBatches: { $sum: 1 },
              totalItems: { $sum: { $size: "$items" } },
              totalEstimatedCost: { $sum: "$totalEstimatedCost" },
              totalActualCost: { $sum: "$totalActualCost" },
            },
          },
        ]),
        MaintenanceBatch.aggregate([
          { $match: query },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.entryReason",
              estimatedCost: { $sum: { $ifNull: ["$items.estimatedCost", 0] } },
              actualCost: { $sum: { $ifNull: ["$items.actualCost", 0] } },
              itemCount: { $sum: 1 },
            },
          },
          { $sort: { actualCost: -1 } },
        ]),
        MaintenanceBatch.aggregate([
          { $match: query },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
              },
              estimatedCost: { $sum: "$totalEstimatedCost" },
              actualCost: { $sum: "$totalActualCost" },
              batchCount: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]),
        MaintenanceBatch.aggregate([
          { $match: query },
          { $unwind: "$items" },
          {
            $lookup: {
              from: "materialinstances",
              localField: "items.materialInstanceId",
              foreignField: "_id",
              as: "inst",
            },
          },
          { $unwind: { path: "$inst", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: "$inst.modelId",
              incidentCount: { $sum: 1 },
              totalCost: {
                $sum: {
                  $ifNull: ["$items.actualCost", "$items.estimatedCost"],
                },
              },
            },
          },
          { $sort: { incidentCount: -1 } },
          { $limit: 10 },
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
              _id: 0,
              materialTypeName: "$mt.name",
              incidentCount: 1,
              totalCost: 1,
            },
          },
        ]),
        MaintenanceBatch.aggregate([
          {
            $match: {
              ...query,
              status: "completed",
              startedAt: { $exists: true },
              completedAt: { $exists: true },
            },
          },
          {
            $project: {
              repairDays: {
                $divide: [
                  { $subtract: ["$completedAt", "$startedAt"] },
                  86_400_000,
                ],
              },
            },
          },
          { $group: { _id: null, avg: { $avg: "$repairDays" } } },
        ]),
        MaintenanceBatch.aggregate([
          { $match: query },
          { $unwind: "$items" },
          { $group: { _id: "$items.itemStatus", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
      ]);

      const c = costAgg[0] ?? {
        totalBatches: 0,
        totalItems: 0,
        totalEstimatedCost: 0,
        totalActualCost: 0,
      };
      const costVariance = c.totalActualCost - c.totalEstimatedCost;

      const summary: Record<string, any> = {
        totalBatches: c.totalBatches,
        totalItems: c.totalItems,
        totalEstimatedCost: c.totalEstimatedCost,
        totalActualCost: c.totalActualCost,
        costVariance,
        costVariancePercent: pctChange(c.totalActualCost, c.totalEstimatedCost),
        costByEntryReason: costByReason.map((r: any) => ({
          reason: r._id,
          estimatedCost: r.estimatedCost,
          actualCost: r.actualCost,
          itemCount: r.itemCount,
        })),
        costByMonth: costByMonth.map((m: any) => ({
          year: m._id.year,
          month: m._id.month,
          estimatedCost: m.estimatedCost,
          actualCost: m.actualCost,
          batchCount: m.batchCount,
        })),
        mostDamagedMaterials: mostDamaged,
        averageRepairTimeDays: Math.round(repairTime[0]?.avg ?? 0),
        resolutionBreakdown: resolutionAgg.map((r: any) => ({
          status: r._id,
          count: r.count,
        })),
      };

      // Period comparison
      const prev = computePreviousPeriod(filters.startDate, filters.endDate);
      if (prev) {
        const prevQuery = {
          ...query,
          createdAt: { $gte: prev.previousStart, $lte: prev.previousEnd },
        };
        const [prevCost] = await Promise.all([
          MaintenanceBatch.aggregate([
            { $match: prevQuery },
            {
              $group: {
                _id: null,
                totalActualCost: { $sum: "$totalActualCost" },
                totalItems: { $sum: { $size: "$items" } },
              },
            },
          ]),
        ]);
        const p = prevCost[0] ?? { totalActualCost: 0, totalItems: 0 };
        summary.periodComparison = {
          currentCost: c.totalActualCost,
          previousCost: p.totalActualCost,
          percentChange: pctChange(c.totalActualCost, p.totalActualCost),
          currentItemCount: c.totalItems,
          previousItemCount: p.totalItems,
          itemCountPercentChange: pctChange(c.totalItems, p.totalItems),
        };
      }

      result.summary = summary;
    }

    return result;
  },

  /**
   * Inventory export: material instances grouped by type and location with
   * enriched metrics (utilization, damage rates, valuation) when includeIds=false.
   */
  async getInventoryExport(
    organizationId: Types.ObjectId | string,
    filters: InventoryExportFilters,
  ) {
    const {
      includeIds = true,
      locationId,
      categoryId,
      status,
      search,
    } = filters;

    const instanceMatch: Record<string, any> = { organizationId };
    if (locationId) instanceMatch.locationId = new Types.ObjectId(locationId);
    if (status) instanceMatch.status = status;

    // Narrow by category → get materialType IDs first
    let materialTypeFilter: Types.ObjectId[] | undefined;
    if (categoryId || search) {
      const mtQuery: Record<string, any> = { organizationId };
      if (categoryId) mtQuery.categoryId = new Types.ObjectId(categoryId);
      if (search) mtQuery.name = { $regex: search, $options: "i" };
      materialTypeFilter = await MaterialModel.find(mtQuery)
        .distinct("_id")
        .lean();
      instanceMatch.modelId = { $in: materialTypeFilter };
    }

    /* --- By material type --- */
    const byType = await MaterialInstance.aggregate([
      { $match: instanceMatch },
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
          statuses: { $push: { status: "$_id.status", count: "$count" } },
        },
      },
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
        $lookup: {
          from: "categories",
          localField: "mt.categoryId",
          foreignField: "_id",
          as: "categories",
        },
      },
      { $sort: { "mt.name": 1 } },
    ]);

    /* --- By location --- */
    const byLocation = await MaterialInstance.aggregate([
      { $match: instanceMatch },
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
          statuses: { $push: { status: "$_id.status", count: "$count" } },
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
      { $sort: { "location.name": 1 } },
    ]);

    const totalInstances = await MaterialInstance.countDocuments(instanceMatch);

    const typeRows = byType.map((t: any) => {
      const statusObj: Record<string, number> = {};
      for (const s of t.statuses) statusObj[s.status] = s.count;

      return {
        ...(includeIds ? { materialTypeId: t._id } : {}),
        materialTypeName: t.mt?.name ?? null,
        code: t.mt?.code ?? null,
        pricePerDay: t.mt?.pricePerDay ?? 0,
        categoryNames: (t.categories ?? []).map((c: any) => c.name),
        totalInstances: t.total,
        instancesByStatus: statusObj,
      };
    });

    const locationRows = byLocation.map((l: any) => {
      const statusObj: Record<string, number> = {};
      for (const s of l.statuses) statusObj[s.status] = s.count;

      return {
        ...(includeIds ? { locationId: l._id } : {}),
        locationName: l.location?.name ?? null,
        totalInstances: l.total,
        instancesByStatus: statusObj,
      };
    });

    const result: Record<string, any> = {
      totalInstances,
      byMaterialType: typeRows,
      byLocation: locationRows,
    };

    if (!includeIds) {
      // Global status breakdown
      const globalStatus: Record<string, number> = {};
      for (const t of byType) {
        for (const s of t.statuses) {
          globalStatus[s.status] = (globalStatus[s.status] ?? 0) + s.count;
        }
      }
      const available = globalStatus["available"] ?? 0;
      const loaned = globalStatus["loaned"] ?? 0;
      const damaged = globalStatus["damaged"] ?? 0;
      const maintenance = globalStatus["maintenance"] ?? 0;

      // Estimate total catalog value (pricePerDay × total instances per type)
      let estimatedDailyValue = 0;
      for (const t of byType) {
        estimatedDailyValue += (t.mt?.pricePerDay ?? 0) * t.total;
      }

      // Top types sorted by total instances
      const topByStock = [...typeRows]
        .sort((a, b) => b.totalInstances - a.totalInstances)
        .slice(0, 10)
        .map((t) => ({ name: t.materialTypeName, total: t.totalInstances }));

      // Top locations sorted by total
      const topLocations = [...locationRows]
        .sort((a, b) => b.totalInstances - a.totalInstances)
        .slice(0, 10)
        .map((l) => ({ name: l.locationName, total: l.totalInstances }));

      result.summary = {
        totalInstances,
        totalMaterialTypes: typeRows.length,
        totalLocations: locationRows.length,
        globalInstancesByStatus: Object.entries(globalStatus).map(
          ([s, count]) => ({ status: s, count }),
        ),
        availabilityRate:
          totalInstances > 0
            ? Math.round((available / totalInstances) * 10000) / 100
            : 0,
        utilizationRate:
          totalInstances > 0
            ? Math.round((loaned / totalInstances) * 10000) / 100
            : 0,
        damageRate:
          totalInstances > 0
            ? Math.round((damaged / totalInstances) * 10000) / 100
            : 0,
        maintenanceRate:
          totalInstances > 0
            ? Math.round((maintenance / totalInstances) * 10000) / 100
            : 0,
        estimatedDailyValue,
        topMaterialTypesByStock: topByStock,
        topLocationsByStock: topLocations,
      };
    }

    return result;
  },

  /**
   * Transfer export: transfer records with condition tracking, enriched
   * with route analysis and condition metrics when includeIds=false.
   */
  async getTransferExport(
    organizationId: Types.ObjectId | string,
    filters: TransferExportFilters,
  ) {
    const { page = 1, limit = 50, includeIds = true } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const query: Record<string, any> = { organizationId };
    if (filters.startDate || filters.endDate) {
      const df: Record<string, any> = {};
      if (filters.startDate) df.$gte = filters.startDate;
      if (filters.endDate) df.$lte = filters.endDate;
      query.createdAt = df;
    }
    if (filters.status) query.status = filters.status;
    if (filters.fromLocationId)
      query.fromLocationId = new Types.ObjectId(filters.fromLocationId);
    if (filters.toLocationId)
      query.toLocationId = new Types.ObjectId(filters.toLocationId);

    const [transfers, total] = await Promise.all([
      Transfer.find(query)
        .skip(skip)
        .limit(Number(limit))
        .populate("fromLocationId", "name")
        .populate("toLocationId", "name")
        .populate("pickedBy", "name email")
        .populate("receivedBy", "name email")
        .sort({ createdAt: -1 })
        .lean(),
      Transfer.countDocuments(query),
    ]);

    const rows = transfers.map((t: any) => {
      const transitDays =
        t.receivedAt && t.sentAt
          ? Math.ceil(
              (new Date(t.receivedAt).getTime() -
                new Date(t.sentAt).getTime()) /
                86_400_000,
            )
          : null;

      return {
        ...(includeIds
          ? {
              transferId: t._id,
              fromLocationId: t.fromLocationId?._id,
              toLocationId: t.toLocationId?._id,
            }
          : {}),
        status: t.status,
        fromLocation: t.fromLocationId?.name ?? null,
        toLocation: t.toLocationId?.name ?? null,
        itemCount: t.items?.length ?? 0,
        pickedBy: t.pickedBy
          ? `${t.pickedBy.name?.firstName ?? ""} ${t.pickedBy.name?.firstSurname ?? ""}`.trim()
          : null,
        receivedBy: t.receivedBy
          ? `${t.receivedBy.name?.firstName ?? ""} ${t.receivedBy.name?.firstSurname ?? ""}`.trim()
          : null,
        sentAt: t.sentAt ?? null,
        receivedAt: t.receivedAt ?? null,
        transitDays,
        senderNotes: t.senderNotes ?? null,
        receiverNotes: t.receiverNotes ?? null,
        createdAt: t.createdAt,
      };
    });

    const result: Record<string, any> = {
      rows,
      pagination: {
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };

    if (!includeIds) {
      const [summaryAgg, byStatus, byMonth, conditionAgg, topRoutes] =
        await Promise.all([
          Transfer.aggregate([
            { $match: query },
            {
              $group: {
                _id: null,
                totalTransfers: { $sum: 1 },
                totalItems: { $sum: { $size: "$items" } },
                avgTransitMs: {
                  $avg: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ["$receivedAt", null] },
                          { $ne: ["$sentAt", null] },
                        ],
                      },
                      { $subtract: ["$receivedAt", "$sentAt"] },
                      null,
                    ],
                  },
                },
                receivedCount: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "received"] }, 1, 0],
                  },
                },
                issueCount: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "issue_reported"] }, 1, 0],
                  },
                },
              },
            },
          ]),
          Transfer.aggregate([
            { $match: query },
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                totalItems: { $sum: { $size: "$items" } },
              },
            },
            { $sort: { count: -1 } },
          ]),
          Transfer.aggregate([
            { $match: query },
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                count: { $sum: 1 },
                totalItems: { $sum: { $size: "$items" } },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ]),
          Transfer.aggregate([
            { $match: query },
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.receivedCondition",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ]),
          Transfer.aggregate([
            { $match: query },
            {
              $group: {
                _id: {
                  from: "$fromLocationId",
                  to: "$toLocationId",
                },
                count: { $sum: 1 },
                totalItems: { $sum: { $size: "$items" } },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: "locations",
                localField: "_id.from",
                foreignField: "_id",
                as: "fromLoc",
              },
            },
            {
              $lookup: {
                from: "locations",
                localField: "_id.to",
                foreignField: "_id",
                as: "toLoc",
              },
            },
            { $unwind: { path: "$fromLoc", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$toLoc", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                fromLocation: "$fromLoc.name",
                toLocation: "$toLoc.name",
                transferCount: "$count",
                totalItems: 1,
              },
            },
          ]),
        ]);

      const s = summaryAgg[0] ?? {
        totalTransfers: 0,
        totalItems: 0,
        avgTransitMs: null,
        receivedCount: 0,
        issueCount: 0,
      };

      const summary: Record<string, any> = {
        totalTransfers: s.totalTransfers,
        totalItemsMoved: s.totalItems,
        averageTransitDays:
          s.avgTransitMs != null
            ? Math.round(s.avgTransitMs / 86_400_000)
            : null,
        completionRate:
          s.totalTransfers > 0
            ? Math.round((s.receivedCount / s.totalTransfers) * 10000) / 100
            : 0,
        issueRate:
          s.totalTransfers > 0
            ? Math.round((s.issueCount / s.totalTransfers) * 10000) / 100
            : 0,
        transfersByStatus: byStatus.map((st: any) => ({
          status: st._id,
          count: st.count,
          totalItems: st.totalItems,
        })),
        transfersByMonth: byMonth.map((m: any) => ({
          year: m._id.year,
          month: m._id.month,
          count: m.count,
          totalItems: m.totalItems,
        })),
        receivedConditionBreakdown: conditionAgg
          .filter((c: any) => c._id != null)
          .map((c: any) => ({
            condition: c._id,
            count: c.count,
          })),
        topRoutes,
      };

      // Period comparison
      const prev = computePreviousPeriod(filters.startDate, filters.endDate);
      if (prev) {
        const prevQuery = {
          ...query,
          createdAt: { $gte: prev.previousStart, $lte: prev.previousEnd },
        };
        const [prevAgg] = await Promise.all([
          Transfer.aggregate([
            { $match: prevQuery },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                totalItems: { $sum: { $size: "$items" } },
              },
            },
          ]),
        ]);
        const p = prevAgg[0] ?? { count: 0, totalItems: 0 };
        summary.periodComparison = {
          currentTransfers: s.totalTransfers,
          previousTransfers: p.count,
          percentChange: pctChange(s.totalTransfers, p.count),
          currentItems: s.totalItems,
          previousItems: p.totalItems,
          itemsPercentChange: pctChange(s.totalItems, p.totalItems),
        };
      }

      result.summary = summary;
    }

    return result;
  },

  /**
   * Billing history export: billing events with subscription lifecycle
   * data and enriched cost/event analytics when includeIds=false.
   */
  async getBillingHistoryExport(
    organizationId: Types.ObjectId | string,
    filters: BillingHistoryExportFilters,
  ) {
    const { page = 1, limit = 50, includeIds = true } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const query: Record<string, any> = { organizationId };
    if (filters.startDate || filters.endDate) {
      const df: Record<string, any> = {};
      if (filters.startDate) df.$gte = filters.startDate;
      if (filters.endDate) df.$lte = filters.endDate;
      query.createdAt = df;
    }
    if (filters.eventType) query.eventType = filters.eventType;

    const [events, total] = await Promise.all([
      BillingEvent.find(query)
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 })
        .lean(),
      BillingEvent.countDocuments(query),
    ]);

    // Current subscription snapshot
    const org = await Organization.findById(organizationId)
      .select("subscription name")
      .lean();
    const sub = (org as any)?.subscription ?? {};

    const rows = events.map((e: any) => ({
      ...(includeIds
        ? {
            eventId: e._id,
            stripeEventId: e.stripeEventId ?? null,
            stripeSubscriptionId: e.stripeSubscriptionId ?? null,
            stripeInvoiceId: e.stripeInvoiceId ?? null,
            stripePaymentIntentId: e.stripePaymentIntentId ?? null,
          }
        : {}),
      eventType: e.eventType,
      amount: e.amount ?? null,
      currency: e.currency ?? "usd",
      previousPlan: e.previousPlan ?? null,
      newPlan: e.newPlan ?? null,
      seatChange: e.seatChange ?? null,
      processed: e.processed,
      error: e.error ?? null,
      createdAt: e.createdAt,
    }));

    const result: Record<string, any> = {
      currentSubscription: {
        plan: sub.plan ?? "free",
        seatCount: sub.seatCount ?? 1,
        currentPeriodStart: sub.currentPeriodStart ?? null,
        currentPeriodEnd: sub.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
        pendingPlan: sub.pendingPlan ?? null,
        pendingPlanEffectiveDate: sub.pendingPlanEffectiveDate ?? null,
      },
      rows,
      pagination: {
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };

    if (!includeIds) {
      const [byEventType, byMonth, paymentAgg, planChanges] = await Promise.all(
        [
          BillingEvent.aggregate([
            { $match: query },
            { $group: { _id: "$eventType", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ]),
          BillingEvent.aggregate([
            { $match: query },
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                count: { $sum: 1 },
                totalAmount: {
                  $sum: { $ifNull: ["$amount", 0] },
                },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ]),
          BillingEvent.aggregate([
            {
              $match: {
                ...query,
                eventType: { $in: ["payment_succeeded", "invoice_paid"] },
              },
            },
            {
              $group: {
                _id: "$currency",
                totalPaid: { $sum: "$amount" },
                paymentCount: { $sum: 1 },
                avgPayment: { $avg: "$amount" },
              },
            },
          ]),
          BillingEvent.aggregate([
            {
              $match: {
                ...query,
                eventType: { $in: ["plan_upgraded", "plan_downgraded"] },
              },
            },
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 0,
                eventType: 1,
                previousPlan: 1,
                newPlan: 1,
                seatChange: 1,
                createdAt: 1,
              },
            },
          ]),
        ],
      );

      const failedPayments = await BillingEvent.countDocuments({
        ...query,
        eventType: { $in: ["payment_failed", "invoice_payment_failed"] },
      });

      const successPayments = await BillingEvent.countDocuments({
        ...query,
        eventType: { $in: ["payment_succeeded", "invoice_paid"] },
      });

      const totalPaymentAttempts = successPayments + failedPayments;

      const summary: Record<string, any> = {
        totalEvents: total,
        eventsByType: byEventType.map((e: any) => ({
          eventType: e._id,
          count: e.count,
        })),
        eventsByMonth: byMonth.map((m: any) => ({
          year: m._id.year,
          month: m._id.month,
          count: m.count,
          totalAmount: m.totalAmount,
        })),
        paymentSummary: paymentAgg.map((p: any) => ({
          currency: p._id,
          totalPaid: p.totalPaid,
          paymentCount: p.paymentCount,
          averagePayment: Math.round(p.avgPayment),
        })),
        paymentSuccessRate:
          totalPaymentAttempts > 0
            ? Math.round((successPayments / totalPaymentAttempts) * 10000) / 100
            : 100,
        failedPaymentCount: failedPayments,
        planChangeHistory: planChanges,
      };

      // Period comparison
      const prev = computePreviousPeriod(filters.startDate, filters.endDate);
      if (prev) {
        const prevQuery = {
          ...query,
          createdAt: { $gte: prev.previousStart, $lte: prev.previousEnd },
        };
        const [prevAgg] = await Promise.all([
          BillingEvent.aggregate([
            { $match: prevQuery },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                totalAmount: {
                  $sum: {
                    $cond: [
                      {
                        $in: [
                          "$eventType",
                          ["payment_succeeded", "invoice_paid"],
                        ],
                      },
                      { $ifNull: ["$amount", 0] },
                      0,
                    ],
                  },
                },
              },
            },
          ]),
        ]);
        const p = prevAgg[0] ?? { count: 0, totalAmount: 0 };

        const currentPaymentTotal = paymentAgg.reduce(
          (acc: number, x: any) => acc + (x.totalPaid ?? 0),
          0,
        );

        summary.periodComparison = {
          currentEvents: total,
          previousEvents: p.count,
          eventsPercentChange: pctChange(total, p.count),
          currentAmountPaid: currentPaymentTotal,
          previousAmountPaid: p.totalAmount,
          amountPercentChange: pctChange(currentPaymentTotal, p.totalAmount),
        };
      }

      result.summary = summary;
    }

    return result;
  },

  /**
   * Location export: location catalog with material capacities detail/summary
   * and occupancy metrics when includeIds=false.
   */
  async getLocationsExport(
    organizationId: Types.ObjectId | string,
    filters: LocationExportFilters,
  ) {
    const { includeIds = true } = filters;

    const match: Record<string, any> = { organizationId };
    if (filters.locationId) match._id = new Types.ObjectId(filters.locationId);
    if (filters.status) match.status = filters.status;
    if (filters.isActive !== undefined) match.isActive = filters.isActive;
    if (filters.search) match.name = { $regex: filters.search, $options: "i" };

    const locations = await Location.aggregate([
      { $match: match },
      {
        $unwind: {
          path: "$materialCapacities",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "materialtypes",
          localField: "materialCapacities.materialTypeId",
          foreignField: "_id",
          as: "mtInfo",
        },
      },
      { $unwind: { path: "$mtInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$_id",
          name: { $first: "$name" },
          code: { $first: "$code" },
          status: { $first: "$status" },
          isActive: { $first: "$isActive" },
          address: { $first: "$address" },
          additionalDetails: { $first: "$additionalDetails" },
          organizationId: { $first: "$organizationId" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          capacities: {
            $push: {
              $cond: [
                { $ifNull: ["$materialCapacities.materialTypeId", false] },
                {
                  materialTypeId: "$materialCapacities.materialTypeId",
                  typeName: { $ifNull: ["$mtInfo.name", null] },
                  maxQuantity: "$materialCapacities.maxQuantity",
                  currentQuantity: "$materialCapacities.currentQuantity",
                },
                "$$REMOVE",
              ],
            },
          },
        },
      },
      { $sort: { name: 1 } },
    ]);

    const rows = locations.map((loc: any) => {
      const caps: any[] = loc.capacities.filter(Boolean);
      const totalCapacity = caps.reduce(
        (s: number, c: any) => s + (c.maxQuantity ?? 0),
        0,
      );
      const totalOccupied = caps.reduce(
        (s: number, c: any) => s + (c.currentQuantity ?? 0),
        0,
      );
      const occupancyRate =
        totalCapacity > 0
          ? Math.round((totalOccupied / totalCapacity) * 10000) / 100
          : 0;

      return {
        ...(includeIds
          ? { locationId: loc._id, organizationId: loc.organizationId }
          : {}),
        name: loc.name,
        code: loc.code,
        status: loc.status,
        isActive: loc.isActive,
        address: loc.address ?? null,
        additionalDetails: loc.additionalDetails ?? null,
        materialCapacitiesDetail: caps.map((c: any) => ({
          ...(includeIds ? { materialTypeId: c.materialTypeId } : {}),
          typeName: c.typeName,
          maxQuantity: c.maxQuantity,
          currentQuantity: c.currentQuantity,
        })),
        materialCapacitiesSummary: {
          totalCapacity,
          totalOccupied,
          occupancyRate,
        },
        createdAt: loc.createdAt,
        updatedAt: loc.updatedAt,
      };
    });

    const result: Record<string, any> = {
      totalLocations: rows.length,
      locations: rows,
    };

    if (!includeIds) {
      const byStatus: Record<string, number> = {};
      const byActive = { active: 0, inactive: 0 };
      for (const r of rows) {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        if (r.isActive) byActive.active++;
        else byActive.inactive++;
      }

      const sorted = [...rows].sort(
        (a, b) =>
          b.materialCapacitiesSummary.occupancyRate -
          a.materialCapacitiesSummary.occupancyRate,
      );
      const topByOccupancy = sorted.slice(0, 10).map((r) => ({
        name: r.name,
        code: r.code,
        occupancyRate: r.materialCapacitiesSummary.occupancyRate,
      }));

      const totalCapacityAll = rows.reduce(
        (s, r) => s + r.materialCapacitiesSummary.totalCapacity,
        0,
      );
      const totalOccupiedAll = rows.reduce(
        (s, r) => s + r.materialCapacitiesSummary.totalOccupied,
        0,
      );
      const avgOccupancyRate =
        totalCapacityAll > 0
          ? Math.round((totalOccupiedAll / totalCapacityAll) * 10000) / 100
          : 0;

      result.summary = {
        totalLocations: rows.length,
        byStatus: Object.entries(byStatus).map(([status, count]) => ({
          status,
          count,
        })),
        byActive,
        avgOccupancyRate,
        totalCapacity: totalCapacityAll,
        totalOccupied: totalOccupiedAll,
        topByOccupancy,
      };
    }

    return result;
  },

  /**
   * Customer export: customer list with real revenue calculated from
   * Loans, and enriched summary with top-revenue/top-loan metrics
   * when includeIds=false.
   */
  async getCustomersExport(
    organizationId: Types.ObjectId | string,
    filters: CustomerExportFilters,
  ) {
    const { page = 1, limit = 50, includeIds = true } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const query: Record<string, any> = { organizationId };
    if (filters.status) query.status = filters.status;
    if (filters.documentType) query.documentType = filters.documentType;
    if (filters.search) {
      query.$or = [
        { "name.firstName": { $regex: filters.search, $options: "i" } },
        { "name.firstSurname": { $regex: filters.search, $options: "i" } },
        { email: { $regex: filters.search, $options: "i" } },
        { documentNumber: { $regex: filters.search, $options: "i" } },
      ];
    }
    if (filters.startDate || filters.endDate) {
      const df: Record<string, any> = {};
      if (filters.startDate) df.$gte = filters.startDate;
      if (filters.endDate) df.$lte = filters.endDate;
      query.createdAt = df;
    }

    const [customers, total] = await Promise.all([
      Customer.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Customer.countDocuments(query),
    ]);

    // Revenue join: aggregate loans for customers on this page
    const customerIds = customers.map((c: any) => c._id);
    const revenueAgg = await Loan.aggregate([
      { $match: { organizationId, customerId: { $in: customerIds } } },
      {
        $group: {
          _id: "$customerId",
          totalRevenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          loanCount: { $sum: 1 },
          lastLoanAt: { $max: "$createdAt" },
        },
      },
    ]);
    const revenueMap = new Map(
      revenueAgg.map((r: any) => [r._id.toString(), r]),
    );

    const rows = customers.map((c: any) => {
      const rev = revenueMap.get(c._id.toString()) ?? {
        totalRevenue: 0,
        loanCount: 0,
        lastLoanAt: null,
      };

      return {
        ...(includeIds
          ? { customerId: c._id, organizationId: c.organizationId }
          : {}),
        fullName: [
          c.name?.firstName,
          c.name?.secondName,
          c.name?.firstSurname,
          c.name?.secondSurname,
        ]
          .filter(Boolean)
          .join(" "),
        email: c.email,
        phone: c.phone ?? null,
        documentType: c.documentType,
        documentNumber: c.documentNumber,
        status: c.status,
        totalLoans: c.totalLoans ?? 0,
        activeLoans: c.activeLoans ?? 0,
        totalRevenue: rev.totalRevenue,
        avgLoanAmount:
          rev.loanCount > 0 ? Math.round(rev.totalRevenue / rev.loanCount) : 0,
        lastLoanAt: rev.lastLoanAt,
        createdAt: c.createdAt,
      };
    });

    const result: Record<string, any> = {
      total,
      page: Number(page),
      limit: Number(limit),
      customers: rows,
    };

    if (!includeIds) {
      // Global aggregations for summary
      const [statusAgg, globalRevenueAgg] = await Promise.all([
        Customer.aggregate([
          { $match: { organizationId } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        Loan.aggregate([
          { $match: { organizationId } },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
              loanCount: { $sum: 1 },
            },
          },
        ]),
      ]);

      const globalRev = globalRevenueAgg[0] ?? {
        totalRevenue: 0,
        loanCount: 0,
      };

      // Top 10 by revenue (across all org customers)
      const topByRevenue = await Loan.aggregate([
        { $match: { organizationId } },
        {
          $group: {
            _id: "$customerId",
            totalRevenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "customers",
            localField: "_id",
            foreignField: "_id",
            as: "customer",
          },
        },
        { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
      ]);

      // Top 10 by loan count
      const topByLoanCount = await Loan.aggregate([
        { $match: { organizationId } },
        {
          $group: {
            _id: "$customerId",
            loanCount: { $sum: 1 },
          },
        },
        { $sort: { loanCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "customers",
            localField: "_id",
            foreignField: "_id",
            as: "customer",
          },
        },
        { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
      ]);

      const summary: Record<string, any> = {
        totalCustomers: await Customer.countDocuments({ organizationId }),
        byStatus: statusAgg.map((s: any) => ({
          status: s._id,
          count: s.count,
        })),
        totalRevenue: globalRev.totalRevenue,
        totalLoans: globalRev.loanCount,
        topByRevenue: topByRevenue.map((t: any) => ({
          fullName: [
            t.customer?.name?.firstName,
            t.customer?.name?.firstSurname,
          ]
            .filter(Boolean)
            .join(" "),
          totalRevenue: t.totalRevenue,
        })),
        topByLoanCount: topByLoanCount.map((t: any) => ({
          fullName: [
            t.customer?.name?.firstName,
            t.customer?.name?.firstSurname,
          ]
            .filter(Boolean)
            .join(" "),
          loanCount: t.loanCount,
        })),
      };

      // Period comparison
      const prev = computePreviousPeriod(filters.startDate, filters.endDate);
      if (prev) {
        const prevCount = await Customer.countDocuments({
          organizationId,
          createdAt: { $gte: prev.previousStart, $lte: prev.previousEnd },
        });
        const currentCount = await Customer.countDocuments({
          organizationId,
          createdAt: { $gte: filters.startDate!, $lte: filters.endDate! },
        });
        summary.periodComparison = {
          currentNewCustomers: currentCount,
          previousNewCustomers: prevCount,
          percentChange: pctChange(currentCount, prevCount),
        };
      }

      result.summary = summary;
    }

    return result;
  },

  /**
   * Request (loan request) export: request list with conversion funnel,
   * revenue analytics, and period comparison when includeIds=false.
   */
  async getRequestsExport(
    organizationId: Types.ObjectId | string,
    filters: RequestExportFilters,
  ) {
    const { page = 1, limit = 50, includeIds = true } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const query: Record<string, any> = { organizationId };
    if (filters.status) query.status = filters.status;
    if (filters.customerId)
      query.customerId = new Types.ObjectId(filters.customerId);

    // createdAt range
    if (filters.createdAtStart || filters.createdAtEnd) {
      const df: Record<string, any> = {};
      if (filters.createdAtStart) df.$gte = filters.createdAtStart;
      if (filters.createdAtEnd) df.$lte = filters.createdAtEnd;
      query.createdAt = df;
    }
    // startDate range (loan start)
    if (filters.loanStartFrom || filters.loanStartTo) {
      const df: Record<string, any> = {};
      if (filters.loanStartFrom) df.$gte = filters.loanStartFrom;
      if (filters.loanStartTo) df.$lte = filters.loanStartTo;
      query.startDate = df;
    }

    const [requests, total] = await Promise.all([
      LoanRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      LoanRequest.countDocuments(query),
    ]);

    const rows = requests.map((r: any) => ({
      ...(includeIds
        ? {
            requestId: r._id,
            customerId: r.customerId,
            loanId: r.loanId ?? null,
            createdBy: r.createdBy ?? null,
            approvedBy: r.approvedBy ?? null,
          }
        : {}),
      code: r.code,
      status: r.status,
      itemCount: Array.isArray(r.items) ? r.items.length : 0,
      totalAmount: r.totalAmount ?? 0,
      subtotal: r.subtotal ?? 0,
      discountAmount: r.discountAmount ?? 0,
      depositAmount: r.depositAmount ?? 0,
      totalDays: r.totalDays ?? 0,
      startDate: r.startDate,
      endDate: r.endDate,
      approvedAt: r.approvedAt ?? null,
      rejectionReason: r.rejectionReason ?? null,
      createdAt: r.createdAt,
    }));

    const result: Record<string, any> = {
      total,
      page: Number(page),
      limit: Number(limit),
      requests: rows,
    };

    if (!includeIds) {
      // All matching requests (unscoped by page) for global stats
      const allQuery = { ...query };
      const [statusAgg, monthAgg, allRequests] = await Promise.all([
        LoanRequest.aggregate([
          { $match: allQuery },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        LoanRequest.aggregate([
          { $match: allQuery },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
              },
              count: { $sum: 1 },
              totalAmount: { $sum: { $ifNull: ["$totalAmount", 0] } },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]),
        LoanRequest.find(allQuery)
          .select("status totalAmount totalDays approvedAt createdAt")
          .lean(),
      ]);

      const totalAll = allRequests.length;
      const statusMap: Record<string, number> = {};
      for (const s of statusAgg) statusMap[s._id] = s.count;

      // Funnel metrics
      const approved =
        (statusMap["approved"] ?? 0) +
        (statusMap["deposit_pending"] ?? 0) +
        (statusMap["assigned"] ?? 0) +
        (statusMap["ready"] ?? 0) +
        (statusMap["shipped"] ?? 0) +
        (statusMap["completed"] ?? 0);
      const completed = statusMap["completed"] ?? 0;
      const rejected = statusMap["rejected"] ?? 0;
      const cancelled = statusMap["cancelled"] ?? 0;

      // Avg approval time (for requests that have approvedAt)
      let totalApprovalMs = 0;
      let approvalCount = 0;
      for (const req of allRequests as any[]) {
        if (req.approvedAt && req.createdAt) {
          totalApprovalMs +=
            new Date(req.approvedAt).getTime() -
            new Date(req.createdAt).getTime();
          approvalCount++;
        }
      }
      const avgApprovalTimeHours =
        approvalCount > 0
          ? Math.round((totalApprovalMs / approvalCount / 3600000) * 100) / 100
          : null;

      const totalRevenue = (allRequests as any[]).reduce(
        (s, r) => s + (r.totalAmount ?? 0),
        0,
      );
      const avgRequestValue =
        totalAll > 0 ? Math.round(totalRevenue / totalAll) : 0;
      const avgDuration =
        totalAll > 0
          ? Math.round(
              (allRequests as any[]).reduce(
                (s, r) => s + (r.totalDays ?? 0),
                0,
              ) / totalAll,
            )
          : 0;

      const summary: Record<string, any> = {
        totalRequests: totalAll,
        byStatus: statusAgg.map((s: any) => ({
          status: s._id,
          count: s.count,
        })),
        byMonth: monthAgg.map((m: any) => ({
          year: m._id.year,
          month: m._id.month,
          count: m.count,
          totalAmount: m.totalAmount,
        })),
        funnel: {
          approvalRate:
            totalAll > 0 ? Math.round((approved / totalAll) * 10000) / 100 : 0,
          completionRate:
            totalAll > 0 ? Math.round((completed / totalAll) * 10000) / 100 : 0,
          rejectionRate:
            totalAll > 0 ? Math.round((rejected / totalAll) * 10000) / 100 : 0,
          cancellationRate:
            totalAll > 0 ? Math.round((cancelled / totalAll) * 10000) / 100 : 0,
          avgApprovalTimeHours,
        },
        avgRequestValue,
        avgDuration,
        totalRevenue,
      };

      // Period comparison
      const prev = computePreviousPeriod(
        filters.createdAtStart,
        filters.createdAtEnd,
      );
      if (prev) {
        const prevQuery = {
          ...allQuery,
          createdAt: { $gte: prev.previousStart, $lte: prev.previousEnd },
        };
        const [prevAgg] = await Promise.all([
          LoanRequest.aggregate([
            { $match: prevQuery },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                totalAmount: { $sum: { $ifNull: ["$totalAmount", 0] } },
              },
            },
          ]),
        ]);
        const p = prevAgg[0] ?? { count: 0, totalAmount: 0 };

        summary.periodComparison = {
          currentRequests: totalAll,
          previousRequests: p.count,
          requestsPercentChange: pctChange(totalAll, p.count),
          currentRevenue: totalRevenue,
          previousRevenue: p.totalAmount,
          revenuePercentChange: pctChange(totalRevenue, p.totalAmount),
        };
      }

      result.summary = summary;
    }

    return result;
  },
};

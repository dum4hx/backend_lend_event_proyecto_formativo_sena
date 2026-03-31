import { Types } from "mongoose";
import { Loan } from "../loan/models/loan.model.ts";
import { Customer } from "../customer/models/customer.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { MaterialModel } from "../material/models/material_type.model.ts";
import { Invoice } from "../invoice/models/invoice.model.ts";
import { LoanRequest } from "../request/models/request.model.ts";

export const analyticsService = {
  /**
   * Returns a high-level dashboard overview for the organization.
   * Optionally filtered by date range.
   */
  async getOverview(
    organizationId: Types.ObjectId,
    dateRange?: { startDate?: Date; endDate?: Date },
  ) {
    const dateFilter: Record<string, any> = {};
    if (dateRange?.startDate) dateFilter.$gte = dateRange.startDate;
    if (dateRange?.endDate) dateFilter.$lte = dateRange.endDate;
    const hasDateFilter = Object.keys(dateFilter).length > 0;

    const loanDateMatch = hasDateFilter
      ? { createdAt: dateFilter }
      : {};
    const invoiceDateMatch = hasDateFilter
      ? { createdAt: dateFilter }
      : {};

    const [
      totalCustomers,
      activeCustomers,
      totalMaterials,
      availableInstances,
      activeLoans,
      overdueLoans,
      pendingRequests,
      invoiceAgg,
    ] = await Promise.all([
      Customer.countDocuments({ organizationId }),
      Customer.countDocuments({ organizationId, status: "active" }),
      MaterialModel.countDocuments({ organizationId }),
      MaterialInstance.countDocuments({
        organizationId,
        status: "available",
      }),
      Loan.countDocuments({ organizationId, status: "active", ...loanDateMatch }),
      Loan.countDocuments({ organizationId, status: "overdue", ...loanDateMatch }),
      LoanRequest.countDocuments({
        organizationId,
        status: "pending",
      }),
      Invoice.aggregate([
        { $match: { organizationId, ...invoiceDateMatch } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amountPaid" },
            totalOutstanding: { $sum: "$amountDue" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const invoiceSummary = invoiceAgg[0] ?? {
      totalRevenue: 0,
      totalOutstanding: 0,
      count: 0,
    };

    return {
      customers: { total: totalCustomers, active: activeCustomers },
      materials: { catalogItems: totalMaterials, availableInstances },
      loans: { active: activeLoans, overdue: overdueLoans },
      requests: { pending: pendingRequests },
      invoices: {
        total: invoiceSummary.count,
        totalRevenue: invoiceSummary.totalRevenue,
        totalOutstanding: invoiceSummary.totalOutstanding,
      },
    };
  },

  /**
   * Returns material utilization stats: status breakdown, most/least used.
   */
  async getMaterialStats(organizationId: Types.ObjectId) {
    const [statusBreakdown, topMaterials] = await Promise.all([
      MaterialInstance.aggregate([
        { $match: { organizationId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Loan.aggregate([
        { $match: { organizationId } },
        { $unwind: "$materialInstanceIds" },
        {
          $group: {
            _id: "$materialInstanceIds",
            loanCount: { $sum: 1 },
          },
        },
        { $sort: { loanCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "materialinstances",
            localField: "_id",
            foreignField: "_id",
            as: "instance",
          },
        },
        { $unwind: "$instance" },
        {
          $lookup: {
            from: "materials",
            localField: "instance.materialId",
            foreignField: "_id",
            as: "material",
          },
        },
        { $unwind: "$material" },
        {
          $project: {
            _id: 1,
            loanCount: 1,
            materialName: "$material.name",
            identifier:
              "$instance.identifiers.barcode",
          },
        },
      ]),
    ]);

    return {
      statusBreakdown: statusBreakdown.map((s) => ({
        status: s._id,
        count: s.count,
      })),
      topMaterials,
    };
  },

  /**
   * Returns revenue breakdown by period. Defaults to last 12 months
   * if no date range is provided.
   */
  async getRevenueStats(
    organizationId: Types.ObjectId,
    dateRange?: { startDate?: Date; endDate?: Date },
  ) {
    const rangeStart =
      dateRange?.startDate ??
      (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 12);
        return d;
      })();
    const rangeEnd = dateRange?.endDate ?? new Date();

    const monthlyRevenue = await Invoice.aggregate([
      {
        $match: {
          organizationId,
          createdAt: { $gte: rangeStart, $lte: rangeEnd },
          status: { $in: ["paid", "partially_paid"] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          revenue: { $sum: "$amountPaid" },
          invoiceCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const byType = await Invoice.aggregate([
      {
        $match: {
          organizationId,
          status: { $in: ["paid", "partially_paid"] },
        },
      },
      {
        $group: {
          _id: "$type",
          revenue: { $sum: "$amountPaid" },
          count: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    return {
      monthlyRevenue: monthlyRevenue.map((m) => ({
        year: m._id.year,
        month: m._id.month,
        revenue: m.revenue,
        invoiceCount: m.invoiceCount,
      })),
      revenueByType: byType.map((t) => ({
        type: t._id,
        revenue: t.revenue,
        count: t.count,
      })),
    };
  },

  /**
   * Returns customer activity statistics.
   */
  async getCustomerStats(organizationId: Types.ObjectId) {
    const [statusBreakdown, topCustomers] = await Promise.all([
      Customer.aggregate([
        { $match: { organizationId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Loan.aggregate([
        { $match: { organizationId } },
        { $group: { _id: "$customerId", loanCount: { $sum: 1 } } },
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
        { $unwind: "$customer" },
        {
          $project: {
            _id: 1,
            loanCount: 1,
            name: "$customer.name",
            email: "$customer.email",
          },
        },
      ]),
    ]);

    return {
      statusBreakdown: statusBreakdown.map((s) => ({
        status: s._id,
        count: s.count,
      })),
      topCustomers,
    };
  },
};

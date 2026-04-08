import { Organization } from "../organization/models/organization.model.ts";
import { User } from "../user/models/user.model.ts";
import { BillingEvent } from "../billing/models/billing_event.model.ts";
import { Loan } from "../loan/models/loan.model.ts";
import { Invoice } from "../invoice/models/invoice.model.ts";
import { SubscriptionType } from "../subscription_type/models/subscription_type.model.ts";
import { Customer } from "../customer/models/customer.model.ts";
import { Location } from "../location/models/location.model.ts";
import { MaterialModel } from "../material/models/material_type.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";

/* ---------- Types ---------- */

export interface PlatformOverview {
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  totalUsers: number;
  activeUsers: number;
  // Revenue (no PII)
  monthlyRecurringRevenue: number;
  totalLoansProcessed: number;
  totalInvoicesGenerated: number;
}

export interface OrganizationActivityStats {
  byStatus: { status: string; count: number }[];
  byPlan: { plan: string; count: number }[];
  growthTrend: { period: string; newOrganizations: number }[];
  averageSeatCount: number;
  averageCatalogItemCount: number;
}

export interface PaginatedOrganizations {
  organizations: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserActivityStats {
  byRole: { role: string; count: number }[];
  byStatus: { status: string; count: number }[];
  growthTrend: { period: string; newUsers: number }[];
  averageUsersPerOrganization: number;
}

export interface RevenueStats {
  totalRevenue: number;
  revenueByPlan: { plan: string; revenue: number; organizationCount: number }[];
  monthlyTrend: { period: string; revenue: number }[];
  averageRevenuePerOrganization: number;
}

export interface SubscriptionStats {
  totalActiveSubscriptions: number;
  subscriptionsByPlan: { plan: string; count: number; percentage: number }[];
  churnRate: number;
  upgrades: number;
  downgrades: number;
}

/* ---------- Export filter types ---------- */

interface PlatformKpisExportFilters {
  startDate?: Date;
  endDate?: Date;
  includeIds?: boolean;
}

interface SubscriptionExportFilters {
  startDate?: Date;
  endDate?: Date;
  plan?: string;
  orgStatus?: string;
  page?: number;
  limit?: number;
  includeIds?: boolean;
}

interface UsageExportFilters {
  startDate?: Date;
  endDate?: Date;
  plan?: string;
  orgStatus?: string;
  page?: number;
  limit?: number;
  includeIds?: boolean;
}

/* ---------- Helpers ---------- */

function computePreviousPeriod(startDate?: Date, endDate?: Date) {
  if (!startDate || !endDate) return undefined;
  const durationMs = endDate.getTime() - startDate.getTime();
  const previousEnd = new Date(startDate.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - durationMs);
  return { previousStart, previousEnd };
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

/* ---------- Admin Analytics Service ---------- */

export const adminService = {
  /**
   * Gets platform overview statistics.
   * High-level metrics without any PII.
   */
  async getPlatformOverview(): Promise<PlatformOverview> {
    const [
      totalOrganizations,
      activeOrganizations,
      suspendedOrganizations,
      totalUsers,
      activeUsers,
      totalLoansProcessed,
      totalInvoicesGenerated,
      revenueData,
    ] = await Promise.all([
      Organization.countDocuments(),
      Organization.countDocuments({ status: "active" }),
      Organization.countDocuments({ status: "suspended" }),
      User.countDocuments(),
      User.countDocuments({ status: "active" }),
      Loan.countDocuments(),
      Invoice.countDocuments(),
      this.calculateMonthlyRecurringRevenue(),
    ]);

    return {
      totalOrganizations,
      activeOrganizations,
      suspendedOrganizations,
      totalUsers,
      activeUsers,
      monthlyRecurringRevenue: revenueData,
      totalLoansProcessed,
      totalInvoicesGenerated,
    };
  },

  /**
   * Gets organization activity statistics.
   * Aggregated data only - no organization names, emails, or identifiers.
   */
  async getOrganizationActivity(
    periodMonths: number = 12,
  ): Promise<OrganizationActivityStats> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - periodMonths);

    const [byStatus, byPlan, growthTrend, avgStats] = await Promise.all([
      // Organization count by status
      Organization.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $project: { status: "$_id", count: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ]),

      // Organization count by subscription plan
      Organization.aggregate([
        {
          $group: {
            _id: { $ifNull: ["$subscription.plan", "free"] },
            count: { $sum: 1 },
          },
        },
        { $project: { plan: "$_id", count: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ]),

      // Growth trend by month
      Organization.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            newOrganizations: { $sum: 1 },
          },
        },
        {
          $project: {
            period: {
              $concat: [
                { $toString: "$_id.year" },
                "-",
                {
                  $cond: [
                    { $lt: ["$_id.month", 10] },
                    { $concat: ["0", { $toString: "$_id.month" }] },
                    { $toString: "$_id.month" },
                  ],
                },
              ],
            },
            newOrganizations: 1,
            _id: 0,
          },
        },
        { $sort: { period: 1 } },
      ]),

      // Average stats
      Organization.aggregate([
        { $match: { status: "active" } },
        {
          $group: {
            _id: null,
            avgSeats: { $avg: { $ifNull: ["$subscription.seatCount", 1] } },
            avgCatalogItems: {
              $avg: { $ifNull: ["$subscription.catalogItemCount", 0] },
            },
          },
        },
      ]),
    ]);

    return {
      byStatus,
      byPlan,
      growthTrend,
      averageSeatCount: Math.round((avgStats[0]?.avgSeats ?? 1) * 10) / 10,
      averageCatalogItemCount:
        Math.round((avgStats[0]?.avgCatalogItems ?? 0) * 10) / 10,
    };
  },

  /**
   * Gets a paginated list of organizations with PII.
   */
  async getOrganizationPii(
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedOrganizations> {
    const skip = (page - 1) * limit;

    const [organizations, total] = await Promise.all([
      Organization.find()
        .select(
          "name legalName email phone address subscription status createdAt",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Organization.countDocuments(),
    ]);

    return {
      organizations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Gets user activity statistics.
   * Aggregated data only - no usernames, emails, or identifiable info.
   */
  async getUserActivity(periodMonths: number = 12): Promise<UserActivityStats> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - periodMonths);

    const [byRole, byStatus, growthTrend, avgUsersPerOrg] = await Promise.all([
      // User count by role — join Role collection to resolve roleId → name.
      // roleId is stored as a string so it must be cast to ObjectId before lookup.
      User.aggregate([
        {
          $addFields: {
            roleObjectId: { $toObjectId: "$roleId" },
          },
        },
        {
          $lookup: {
            from: "roles",
            localField: "roleObjectId",
            foreignField: "_id",
            as: "roleDoc",
          },
        },
        {
          $group: {
            _id: {
              $ifNull: [{ $arrayElemAt: ["$roleDoc.name", 0] }, "unknown"],
            },
            count: { $sum: 1 },
          },
        },
        { $project: { role: "$_id", count: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ]),

      // User count by status
      User.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $project: { status: "$_id", count: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ]),

      // Growth trend by month
      User.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            newUsers: { $sum: 1 },
          },
        },
        {
          $project: {
            period: {
              $concat: [
                { $toString: "$_id.year" },
                "-",
                {
                  $cond: [
                    { $lt: ["$_id.month", 10] },
                    { $concat: ["0", { $toString: "$_id.month" }] },
                    { $toString: "$_id.month" },
                  ],
                },
              ],
            },
            newUsers: 1,
            _id: 0,
          },
        },
        { $sort: { period: 1 } },
      ]),

      // Average users per organization
      User.aggregate([
        { $group: { _id: "$organizationId", userCount: { $sum: 1 } } },
        { $group: { _id: null, avgUsers: { $avg: "$userCount" } } },
      ]),
    ]);

    return {
      byRole,
      byStatus,
      growthTrend,
      averageUsersPerOrganization:
        Math.round((avgUsersPerOrg[0]?.avgUsers ?? 1) * 10) / 10,
    };
  },

  /**
   * Gets revenue statistics.
   * Financial data only - no customer information.
   */
  async getRevenueStats(periodMonths: number = 12): Promise<RevenueStats> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - periodMonths);

    // Get subscription types for pricing
    const subscriptionTypes = await SubscriptionType.find({ status: "active" });
    const planPricing = new Map<string, number>();
    for (const st of subscriptionTypes) {
      planPricing.set(st.plan, st.baseCost);
    }

    const [revenueByPlan, monthlyTrend, totalOrgs] = await Promise.all([
      // Revenue by plan (calculated from organization subscriptions)
      Organization.aggregate([
        { $match: { status: "active" } },
        {
          $group: {
            _id: { $ifNull: ["$subscription.plan", "free"] },
            organizationCount: { $sum: 1 },
            totalSeats: { $sum: { $ifNull: ["$subscription.seatCount", 1] } },
          },
        },
        {
          $project: {
            plan: "$_id",
            organizationCount: 1,
            totalSeats: 1,
            _id: 0,
          },
        },
        { $sort: { organizationCount: -1 } },
      ]),

      // Monthly billing events
      BillingEvent.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            eventType: { $in: ["payment_succeeded", "invoice_paid"] },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            revenue: { $sum: { $ifNull: ["$amount", 0] } },
          },
        },
        {
          $project: {
            period: {
              $concat: [
                { $toString: "$_id.year" },
                "-",
                {
                  $cond: [
                    { $lt: ["$_id.month", 10] },
                    { $concat: ["0", { $toString: "$_id.month" }] },
                    { $toString: "$_id.month" },
                  ],
                },
              ],
            },
            revenue: 1,
            _id: 0,
          },
        },
        { $sort: { period: 1 } },
      ]),

      // Total active organizations for averages
      Organization.countDocuments({ status: "active" }),
    ]);

    // Calculate revenue by plan using pricing
    const revenueByPlanWithAmount = revenueByPlan.map((item) => {
      const basePrice = planPricing.get(item.plan) ?? 0;
      const subscriptionType = subscriptionTypes.find(
        (st) => st.plan === item.plan,
      );
      const seatPrice =
        subscriptionType?.billingModel === "dynamic"
          ? (subscriptionType.pricePerSeat ?? 0) * item.totalSeats
          : 0;
      const revenue = item.organizationCount * basePrice + seatPrice;

      return {
        plan: item.plan,
        revenue: revenue / 100, // Convert to dollars
        organizationCount: item.organizationCount,
      };
    });

    const totalRevenue = revenueByPlanWithAmount.reduce(
      (sum, item) => sum + item.revenue,
      0,
    );

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      revenueByPlan: revenueByPlanWithAmount,
      monthlyTrend: monthlyTrend.map((m) => ({
        period: m.period,
        revenue: (m.revenue ?? 0) / 100,
      })),
      averageRevenuePerOrganization:
        totalOrgs > 0 ? Math.round((totalRevenue / totalOrgs) * 100) / 100 : 0,
    };
  },

  /**
   * Gets subscription statistics.
   */
  async getSubscriptionStats(): Promise<SubscriptionStats> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [subscriptionsByPlan, billingEvents, totalActive] = await Promise.all(
      [
        // Subscriptions by plan
        Organization.aggregate([
          { $match: { status: { $in: ["active", "suspended"] } } },
          {
            $group: {
              _id: { $ifNull: ["$subscription.plan", "free"] },
              count: { $sum: 1 },
            },
          },
          { $project: { plan: "$_id", count: 1, _id: 0 } },
          { $sort: { count: -1 } },
        ]),

        // Recent billing events for churn/upgrade/downgrade
        BillingEvent.aggregate([
          { $match: { createdAt: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: "$eventType",
              count: { $sum: 1 },
            },
          },
        ]),

        // Total active subscriptions (excluding free)
        Organization.countDocuments({
          status: "active",
          "subscription.plan": { $ne: "free", $exists: true },
        }),
      ],
    );

    const total = subscriptionsByPlan.reduce((sum, p) => sum + p.count, 0);
    const subscriptionsWithPercentage = subscriptionsByPlan.map((item) => ({
      plan: item.plan,
      count: item.count,
      percentage: total > 0 ? Math.round((item.count / total) * 1000) / 10 : 0,
    }));

    // Extract event counts
    const eventCounts = new Map(billingEvents.map((e) => [e._id, e.count]));

    const cancellations =
      (eventCounts.get("subscription_cancelled") ?? 0) +
      (eventCounts.get("plan_downgraded") ?? 0);

    const churnRate =
      totalActive > 0
        ? Math.round((cancellations / totalActive) * 1000) / 10
        : 0;

    return {
      totalActiveSubscriptions: totalActive,
      subscriptionsByPlan: subscriptionsWithPercentage,
      churnRate,
      upgrades: eventCounts.get("plan_upgraded") ?? 0,
      downgrades: eventCounts.get("plan_downgraded") ?? 0,
    };
  },

  /**
   * Gets platform health metrics.
   */
  async getPlatformHealth(): Promise<{
    overdueLoans: number;
    overdueInvoices: number;
    suspendedOrganizations: number;
    recentErrors: number;
  }> {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const [
      overdueLoans,
      overdueInvoices,
      suspendedOrgs,
      recentPaymentFailures,
    ] = await Promise.all([
      Loan.countDocuments({ status: "overdue" }),
      Invoice.countDocuments({
        status: "pending",
        dueDate: { $lt: new Date() },
      }),
      Organization.countDocuments({ status: "suspended" }),
      BillingEvent.countDocuments({
        createdAt: { $gte: oneDayAgo },
        eventType: { $in: ["payment_failed", "invoice_payment_failed"] },
      }),
    ]);

    return {
      overdueLoans,
      overdueInvoices,
      suspendedOrganizations: suspendedOrgs,
      recentErrors: recentPaymentFailures,
    };
  },

  /**
   * Helper: Calculate MRR from active subscriptions.
   */
  async calculateMonthlyRecurringRevenue(): Promise<number> {
    const subscriptionTypes = await SubscriptionType.find({ status: "active" });
    const planPricing = new Map<
      string,
      { baseCost: number; pricePerSeat: number; billingModel: string }
    >();

    for (const st of subscriptionTypes) {
      planPricing.set(st.plan, {
        baseCost: st.baseCost,
        pricePerSeat: st.pricePerSeat,
        billingModel: st.billingModel,
      });
    }

    const organizations = await Organization.find({
      status: "active",
      "subscription.plan": { $ne: "free" },
    }).select("subscription");

    let mrr = 0;
    for (const org of organizations) {
      const plan = org.subscription?.plan ?? "free";
      const pricing = planPricing.get(plan);

      if (pricing) {
        mrr += pricing.baseCost;
        if (pricing.billingModel === "dynamic") {
          const seats = org.subscription?.seatCount ?? 1;
          mrr += pricing.pricePerSeat * seats;
        }
      }
    }

    return mrr / 100; // Convert to dollars
  },

  /**
   * Gets activity log (non-PII billing events).
   */
  async getRecentActivity(limit: number = 50): Promise<
    {
      eventType: string;
      timestamp: Date;
      plan?: string | undefined;
      amount?: number | undefined;
    }[]
  > {
    const events = await BillingEvent.find()
      .select("eventType createdAt newPlan amount")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Return only non-PII data
    return events.map((e) => ({
      eventType: e.eventType,
      timestamp: e.createdAt,
      plan: e.newPlan ?? undefined,
      amount: e.amount ? e.amount / 100 : undefined,
    }));
  },

  /* ================================================================
   *  EXPORT ENDPOINTS
   * ================================================================ */

  /**
   * Platform KPIs Export.
   * includeIds=true  → monthly breakdown with org/user counts, loans, invoices, MRR.
   * includeIds=false → aggregated summary + growth rates + periodComparison.
   */
  async getPlatformKpisExport(filters: PlatformKpisExportFilters) {
    const { startDate, endDate, includeIds = true } = filters;

    const dateFilter: Record<string, any> = {};
    if (startDate) dateFilter.$gte = startDate;
    if (endDate) dateFilter.$lte = endDate;
    const hasDate = Object.keys(dateFilter).length > 0;

    if (includeIds) {
      /* ---- Monthly breakdown ---- */
      const matchStage: Record<string, any> = {};
      if (hasDate) matchStage.createdAt = dateFilter;

      const [orgsByMonth, usersByMonth, loansByMonth, invoicesByMonth] =
        await Promise.all([
          Organization.aggregate([
            ...(hasDate ? [{ $match: matchStage }] : []),
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1 as const, "_id.month": 1 as const } },
          ]),
          User.aggregate([
            ...(hasDate ? [{ $match: matchStage }] : []),
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1 as const, "_id.month": 1 as const } },
          ]),
          Loan.aggregate([
            ...(hasDate ? [{ $match: matchStage }] : []),
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1 as const, "_id.month": 1 as const } },
          ]),
          Invoice.aggregate([
            ...(hasDate ? [{ $match: matchStage }] : []),
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1 as const, "_id.month": 1 as const } },
          ]),
        ]);

      // Build a map keyed by "YYYY-MM"
      const monthMap = new Map<
        string,
        {
          year: number;
          month: number;
          newOrgs: number;
          newUsers: number;
          totalLoans: number;
          totalInvoices: number;
        }
      >();

      const addToMap = (
        rows: { _id: { year: number; month: number }; count: number }[],
        field: string,
      ) => {
        for (const r of rows) {
          const key = `${r._id.year}-${String(r._id.month).padStart(2, "0")}`;
          const entry = monthMap.get(key) ?? {
            year: r._id.year,
            month: r._id.month,
            newOrgs: 0,
            newUsers: 0,
            totalLoans: 0,
            totalInvoices: 0,
          };
          (entry as any)[field] = r.count;
          monthMap.set(key, entry);
        }
      };

      addToMap(orgsByMonth, "newOrgs");
      addToMap(usersByMonth, "newUsers");
      addToMap(loansByMonth, "totalLoans");
      addToMap(invoicesByMonth, "totalInvoices");

      const monthlyBreakdown = Array.from(monthMap.values()).sort(
        (a, b) => a.year - b.year || a.month - b.month,
      );

      return { monthlyBreakdown, generatedAt: new Date().toISOString() };
    }

    /* ---- includeIds=false → aggregated summary ---- */
    const orgQuery: Record<string, any> = {};
    const userQuery: Record<string, any> = {};
    const loanQuery: Record<string, any> = {};
    const invoiceQuery: Record<string, any> = {};
    if (hasDate) {
      orgQuery.createdAt = dateFilter;
      userQuery.createdAt = dateFilter;
      loanQuery.createdAt = dateFilter;
      invoiceQuery.createdAt = dateFilter;
    }

    const [
      totalOrgs,
      activeOrgs,
      suspendedOrgs,
      cancelledOrgs,
      totalUsers,
      activeUsers,
      inactiveUsers,
      pendingUsers,
      totalLoans,
      totalInvoices,
      mrrData,
      seatData,
    ] = await Promise.all([
      Organization.countDocuments(orgQuery),
      Organization.countDocuments({ ...orgQuery, status: "active" }),
      Organization.countDocuments({ ...orgQuery, status: "suspended" }),
      Organization.countDocuments({ ...orgQuery, status: "cancelled" }),
      User.countDocuments(userQuery),
      User.countDocuments({ ...userQuery, status: "active" }),
      User.countDocuments({ ...userQuery, status: "inactive" }),
      User.countDocuments({ ...userQuery, status: "pending" }),
      Loan.countDocuments(loanQuery),
      Invoice.countDocuments(invoiceQuery),
      // MRR from active orgs
      Organization.aggregate([
        { $match: { status: "active" } },
        {
          $lookup: {
            from: "subscriptiontypes",
            localField: "subscription.plan",
            foreignField: "plan",
            as: "subType",
          },
        },
        { $unwind: { path: "$subType", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            mrr: { $sum: { $ifNull: ["$subType.baseCost", 0] } },
          },
        },
      ]),
      // Avg seats & catalog items
      Organization.aggregate([
        { $match: { status: "active" } },
        {
          $group: {
            _id: null,
            avgSeats: { $avg: { $ifNull: ["$subscription.seatCount", 0] } },
            avgCatalogItems: {
              $avg: { $ifNull: ["$subscription.catalogItemCount", 0] },
            },
          },
        },
      ]),
    ]);

    const mrr = mrrData.length > 0 ? mrrData[0].mrr / 100 : 0;
    const arr = mrr * 12;
    const avgSeatsPerOrg =
      seatData.length > 0 ? Math.round(seatData[0].avgSeats * 100) / 100 : 0;
    const avgCatalogItemsPerOrg =
      seatData.length > 0
        ? Math.round(seatData[0].avgCatalogItems * 100) / 100
        : 0;
    const avgUsersPerOrg =
      totalOrgs > 0 ? Math.round((totalUsers / totalOrgs) * 100) / 100 : 0;

    const summary: Record<string, any> = {
      currentKpis: {
        totalOrgs,
        activeOrgs,
        totalUsers,
        activeUsers,
        totalLoans,
        totalInvoices,
        mrr,
        arr,
      },
      avgUsersPerOrg,
      avgSeatsPerOrg,
      avgCatalogItemsPerOrg,
      orgsByStatus: {
        active: activeOrgs,
        suspended: suspendedOrgs,
        cancelled: cancelledOrgs,
      },
      usersByStatus: {
        active: activeUsers,
        inactive: inactiveUsers,
        pending: pendingUsers,
      },
    };

    // Period comparison
    const prev = computePreviousPeriod(startDate, endDate);
    if (prev) {
      const prevDateFilter = {
        $gte: prev.previousStart,
        $lte: prev.previousEnd,
      };

      const [prevOrgs, prevUsers, prevLoans, prevInvoices] = await Promise.all([
        Organization.countDocuments({ createdAt: prevDateFilter }),
        User.countDocuments({ createdAt: prevDateFilter }),
        Loan.countDocuments({ createdAt: prevDateFilter }),
        Invoice.countDocuments({ createdAt: prevDateFilter }),
      ]);

      summary.periodComparison = {
        previous: {
          orgs: prevOrgs,
          users: prevUsers,
          loans: prevLoans,
          invoices: prevInvoices,
        },
        current: {
          orgs: totalOrgs,
          users: totalUsers,
          loans: totalLoans,
          invoices: totalInvoices,
        },
        changes: {
          orgs: pctChange(totalOrgs, prevOrgs),
          users: pctChange(totalUsers, prevUsers),
          loans: pctChange(totalLoans, prevLoans),
          invoices: pctChange(totalInvoices, prevInvoices),
        },
      };
    }

    return { summary, generatedAt: new Date().toISOString() };
  },

  /**
   * Subscriptions Export.
   * includeIds=true  → paginated list of org subscriptions (no sensitive PII).
   * includeIds=false → aggregated subscription analytics + churn + payments.
   */
  async getSubscriptionsExport(filters: SubscriptionExportFilters) {
    const {
      startDate,
      endDate,
      plan,
      orgStatus,
      page = 1,
      limit = 50,
      includeIds = true,
    } = filters;

    const orgMatch: Record<string, any> = {};
    if (plan) orgMatch["subscription.plan"] = plan;
    if (orgStatus) orgMatch.status = orgStatus;
    if (startDate || endDate) {
      const df: Record<string, any> = {};
      if (startDate) df.$gte = startDate;
      if (endDate) df.$lte = endDate;
      orgMatch.createdAt = df;
    }

    if (includeIds) {
      const skip = (Number(page) - 1) * Number(limit);
      const [subscriptions, total] = await Promise.all([
        Organization.find(orgMatch)
          .select(
            "name status subscription.plan subscription.seatCount subscription.catalogItemCount subscription.currentPeriodStart subscription.currentPeriodEnd subscription.cancelAtPeriodEnd subscription.pendingPlan createdAt",
          )
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        Organization.countDocuments(orgMatch),
      ]);

      const rows = subscriptions.map((o: any) => ({
        orgId: o._id,
        orgName: o.name,
        orgStatus: o.status,
        plan: o.subscription?.plan ?? "free",
        seatCount: o.subscription?.seatCount ?? 0,
        catalogItemCount: o.subscription?.catalogItemCount ?? 0,
        currentPeriodStart: o.subscription?.currentPeriodStart ?? null,
        currentPeriodEnd: o.subscription?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: o.subscription?.cancelAtPeriodEnd ?? false,
        pendingPlan: o.subscription?.pendingPlan ?? null,
        orgCreatedAt: o.createdAt,
      }));

      return {
        subscriptions: rows,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
        generatedAt: new Date().toISOString(),
      };
    }

    /* ---- includeIds=false → aggregated ---- */
    const billingDateFilter: Record<string, any> = {};
    if (startDate || endDate) {
      if (startDate) billingDateFilter.$gte = startDate;
      if (endDate) billingDateFilter.$lte = endDate;
    }
    const hasBillingDate = Object.keys(billingDateFilter).length > 0;

    const [
      allOrgs,
      byPlanAgg,
      byOrgStatusAgg,
      churnEvents,
      upgradeEvents,
      downgradeEvents,
      paymentSucceeded,
      paymentFailed,
      subTypes,
    ] = await Promise.all([
      Organization.countDocuments(orgMatch),
      Organization.aggregate([
        { $match: orgMatch },
        {
          $group: {
            _id: "$subscription.plan",
            count: { $sum: 1 },
          },
        },
      ]),
      Organization.aggregate([
        { $match: orgMatch },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      BillingEvent.countDocuments({
        eventType: "subscription_cancelled",
        ...(hasBillingDate ? { createdAt: billingDateFilter } : {}),
      }),
      BillingEvent.countDocuments({
        eventType: "plan_upgraded",
        ...(hasBillingDate ? { createdAt: billingDateFilter } : {}),
      }),
      BillingEvent.countDocuments({
        eventType: "plan_downgraded",
        ...(hasBillingDate ? { createdAt: billingDateFilter } : {}),
      }),
      BillingEvent.countDocuments({
        eventType: "payment_succeeded",
        ...(hasBillingDate ? { createdAt: billingDateFilter } : {}),
      }),
      BillingEvent.countDocuments({
        eventType: "payment_failed",
        ...(hasBillingDate ? { createdAt: billingDateFilter } : {}),
      }),
      SubscriptionType.find().lean(),
    ]);

    // Build price map: plan → baseCost (cents)
    const priceMap = new Map<string, number>();
    for (const st of subTypes) {
      priceMap.set(st.plan, st.baseCost ?? 0);
    }

    const byPlan = byPlanAgg.map((p: any) => {
      const planName = p._id ?? "free";
      const baseCost = priceMap.get(planName) ?? 0;
      return {
        plan: planName,
        count: p.count,
        percentage:
          allOrgs > 0 ? Math.round((p.count / allOrgs) * 10000) / 100 : 0,
        estimatedMonthlyRevenue: (baseCost * p.count) / 100,
      };
    });

    const topPlanByCount = byPlan.reduce(
      (top: any, p: any) => (p.count > (top?.count ?? 0) ? p : top),
      null,
    );
    const topPlanByRevenue = byPlan.reduce(
      (top: any, p: any) =>
        p.estimatedMonthlyRevenue > (top?.estimatedMonthlyRevenue ?? 0)
          ? p
          : top,
      null,
    );

    const byOrgStatus = byOrgStatusAgg.map((s: any) => ({
      status: s._id,
      count: s.count,
    }));

    const totalPayments = paymentSucceeded + paymentFailed;
    const paymentAnalytics = {
      succeeded: paymentSucceeded,
      failed: paymentFailed,
      successRate:
        totalPayments > 0
          ? Math.round((paymentSucceeded / totalPayments) * 10000) / 100
          : 0,
    };

    const summary: Record<string, any> = {
      totalOrgs: allOrgs,
      byPlan,
      byOrgStatus,
      churn: churnEvents,
      upgrades: upgradeEvents,
      downgrades: downgradeEvents,
      paymentAnalytics,
      topPlanByCount: topPlanByCount
        ? { plan: topPlanByCount.plan, count: topPlanByCount.count }
        : null,
      topPlanByRevenue: topPlanByRevenue
        ? {
            plan: topPlanByRevenue.plan,
            revenue: topPlanByRevenue.estimatedMonthlyRevenue,
          }
        : null,
    };

    // Period comparison
    const prev = computePreviousPeriod(startDate, endDate);
    if (prev) {
      const prevBillingFilter = {
        $gte: prev.previousStart,
        $lte: prev.previousEnd,
      };
      const prevOrgFilter: Record<string, any> = { ...orgMatch };
      delete prevOrgFilter.createdAt;
      prevOrgFilter.createdAt = prevBillingFilter;

      const [prevOrgs, prevChurn, prevUpgrades, prevDowngrades] =
        await Promise.all([
          Organization.countDocuments(prevOrgFilter),
          BillingEvent.countDocuments({
            eventType: "subscription_cancelled",
            createdAt: prevBillingFilter,
          }),
          BillingEvent.countDocuments({
            eventType: "plan_upgraded",
            createdAt: prevBillingFilter,
          }),
          BillingEvent.countDocuments({
            eventType: "plan_downgraded",
            createdAt: prevBillingFilter,
          }),
        ]);

      summary.periodComparison = {
        previous: {
          orgs: prevOrgs,
          churn: prevChurn,
          upgrades: prevUpgrades,
          downgrades: prevDowngrades,
        },
        current: {
          orgs: allOrgs,
          churn: churnEvents,
          upgrades: upgradeEvents,
          downgrades: downgradeEvents,
        },
        changes: {
          orgs: pctChange(allOrgs, prevOrgs),
          churn: pctChange(churnEvents, prevChurn),
          upgrades: pctChange(upgradeEvents, prevUpgrades),
          downgrades: pctChange(downgradeEvents, prevDowngrades),
        },
      };
    }

    return { summary, generatedAt: new Date().toISOString() };
  },

  /**
   * Usage Export.
   * includeIds=true  → paginated per-org usage metrics (no sensitive PII).
   * includeIds=false → platform totals, averages, top-10 orgs, distribution.
   */
  async getUsageExport(filters: UsageExportFilters) {
    const {
      startDate,
      endDate,
      plan,
      orgStatus,
      page = 1,
      limit = 50,
      includeIds = true,
    } = filters;

    const orgMatch: Record<string, any> = {};
    if (plan) orgMatch["subscription.plan"] = plan;
    if (orgStatus) orgMatch.status = orgStatus;

    const dateFilter: Record<string, any> = {};
    if (startDate) dateFilter.$gte = startDate;
    if (endDate) dateFilter.$lte = endDate;
    const hasDate = Object.keys(dateFilter).length > 0;

    if (includeIds) {
      const skip = (Number(page) - 1) * Number(limit);
      const orgBaseMatch = { ...orgMatch };

      const [orgs, total] = await Promise.all([
        Organization.find(orgBaseMatch)
          .select("name status subscription.plan createdAt")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        Organization.countDocuments(orgBaseMatch),
      ]);

      const orgIds = orgs.map((o: any) => o._id);

      const countMatch: Record<string, any> = {
        organizationId: { $in: orgIds },
      };
      if (hasDate) countMatch.createdAt = dateFilter;

      const [
        userCounts,
        activeUserCounts,
        loanCounts,
        invoiceCounts,
        customerCounts,
        locationCounts,
        materialTypeCounts,
        materialInstanceCounts,
      ] = await Promise.all([
        User.aggregate([
          { $match: { organizationId: { $in: orgIds } } },
          { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        ]),
        User.aggregate([
          {
            $match: {
              organizationId: { $in: orgIds },
              status: "active",
            },
          },
          { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        ]),
        Loan.aggregate([
          { $match: countMatch },
          { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        ]),
        Invoice.aggregate([
          { $match: countMatch },
          { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        ]),
        Customer.aggregate([
          { $match: countMatch },
          { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        ]),
        Location.aggregate([
          {
            $match: { organizationId: { $in: orgIds } },
          },
          { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        ]),
        MaterialModel.aggregate([
          {
            $match: { organizationId: { $in: orgIds } },
          },
          { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        ]),
        MaterialInstance.aggregate([
          {
            $match: { organizationId: { $in: orgIds } },
          },
          { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        ]),
      ]);

      const toMap = (
        arr: { _id: any; count: number }[],
      ): Map<string, number> => {
        const m = new Map<string, number>();
        for (const r of arr) m.set(String(r._id), r.count);
        return m;
      };

      const usersMap = toMap(userCounts);
      const activeUsersMap = toMap(activeUserCounts);
      const loansMap = toMap(loanCounts);
      const invoicesMap = toMap(invoiceCounts);
      const customersMap = toMap(customerCounts);
      const locationsMap = toMap(locationCounts);
      const matTypesMap = toMap(materialTypeCounts);
      const matInstancesMap = toMap(materialInstanceCounts);

      const rows = orgs.map((o: any) => {
        const id = String(o._id);
        return {
          orgId: o._id,
          orgName: o.name,
          plan: o.subscription?.plan ?? "free",
          orgStatus: o.status,
          userCount: usersMap.get(id) ?? 0,
          activeUserCount: activeUsersMap.get(id) ?? 0,
          loanCount: loansMap.get(id) ?? 0,
          invoiceCount: invoicesMap.get(id) ?? 0,
          customerCount: customersMap.get(id) ?? 0,
          locationCount: locationsMap.get(id) ?? 0,
          materialTypeCount: matTypesMap.get(id) ?? 0,
          materialInstanceCount: matInstancesMap.get(id) ?? 0,
          createdAt: o.createdAt,
        };
      });

      return {
        organizations: rows,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
        generatedAt: new Date().toISOString(),
      };
    }

    /* ---- includeIds=false → aggregated ---- */
    const countQuery: Record<string, any> = {};
    if (hasDate) countQuery.createdAt = dateFilter;

    const [
      totalOrgs,
      totalUsers,
      totalLoans,
      totalInvoices,
      totalCustomers,
      totalLocations,
      totalMaterialTypes,
      totalMaterialInstances,
      topByLoans,
      topByInvoices,
      topByUsers,
    ] = await Promise.all([
      Organization.countDocuments(orgMatch),
      User.countDocuments(countQuery),
      Loan.countDocuments(countQuery),
      Invoice.countDocuments(countQuery),
      Customer.countDocuments(countQuery),
      Location.countDocuments(),
      MaterialModel.countDocuments(),
      MaterialInstance.countDocuments(),
      // Top 10 by loans
      Loan.aggregate([
        ...(hasDate ? [{ $match: { createdAt: dateFilter } }] : []),
        { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        { $sort: { count: -1 as const } },
        { $limit: 10 },
        {
          $lookup: {
            from: "organizations",
            localField: "_id",
            foreignField: "_id",
            as: "org",
          },
        },
        { $unwind: "$org" },
        {
          $project: {
            _id: 0,
            orgName: "$org.name",
            plan: "$org.subscription.plan",
            count: 1,
          },
        },
      ]),
      // Top 10 by invoices
      Invoice.aggregate([
        ...(hasDate ? [{ $match: { createdAt: dateFilter } }] : []),
        { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        { $sort: { count: -1 as const } },
        { $limit: 10 },
        {
          $lookup: {
            from: "organizations",
            localField: "_id",
            foreignField: "_id",
            as: "org",
          },
        },
        { $unwind: "$org" },
        {
          $project: {
            _id: 0,
            orgName: "$org.name",
            plan: "$org.subscription.plan",
            count: 1,
          },
        },
      ]),
      // Top 10 by users
      User.aggregate([
        { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        { $sort: { count: -1 as const } },
        { $limit: 10 },
        {
          $lookup: {
            from: "organizations",
            localField: "_id",
            foreignField: "_id",
            as: "org",
          },
        },
        { $unwind: "$org" },
        {
          $project: {
            _id: 0,
            orgName: "$org.name",
            plan: "$org.subscription.plan",
            count: 1,
          },
        },
      ]),
    ]);

    const avgPerOrg = {
      users:
        totalOrgs > 0 ? Math.round((totalUsers / totalOrgs) * 100) / 100 : 0,
      loans:
        totalOrgs > 0 ? Math.round((totalLoans / totalOrgs) * 100) / 100 : 0,
      invoices:
        totalOrgs > 0 ? Math.round((totalInvoices / totalOrgs) * 100) / 100 : 0,
      customers:
        totalOrgs > 0
          ? Math.round((totalCustomers / totalOrgs) * 100) / 100
          : 0,
    };

    // Usage distribution buckets for loans
    const loanBuckets = [
      { label: "0", min: 0, max: 0 },
      { label: "1-10", min: 1, max: 10 },
      { label: "11-50", min: 11, max: 50 },
      { label: "51-200", min: 51, max: 200 },
      { label: "201+", min: 201, max: Infinity },
    ];

    const loanDistAgg = await Loan.aggregate([
      ...(hasDate ? [{ $match: { createdAt: dateFilter } }] : []),
      { $group: { _id: "$organizationId", count: { $sum: 1 } } },
    ]);

    const loanCountsByOrg = loanDistAgg.map((r: any) => r.count as number);
    // Include orgs with 0 loans
    const orgsWithLoans = new Set(loanDistAgg.map((r: any) => String(r._id)));
    const orgsWithZeroLoans = totalOrgs - orgsWithLoans.size;

    const usageDistribution = loanBuckets.map((b) => {
      let count: number;
      if (b.min === 0 && b.max === 0) {
        count = orgsWithZeroLoans;
      } else {
        count = loanCountsByOrg.filter((c) => c >= b.min && c <= b.max).length;
      }
      return { bucket: b.label, orgCount: count };
    });

    const summary: Record<string, any> = {
      platformTotals: {
        organizations: totalOrgs,
        users: totalUsers,
        loans: totalLoans,
        invoices: totalInvoices,
        customers: totalCustomers,
        locations: totalLocations,
        materialTypes: totalMaterialTypes,
        materialInstances: totalMaterialInstances,
      },
      avgPerOrg,
      topByLoans,
      topByInvoices,
      topByUsers,
      usageDistribution,
    };

    // Period comparison
    const prev = computePreviousPeriod(startDate, endDate);
    if (prev) {
      const prevFilter = {
        $gte: prev.previousStart,
        $lte: prev.previousEnd,
      };

      const [prevLoans, prevInvoices, prevUsers, prevCustomers] =
        await Promise.all([
          Loan.countDocuments({ createdAt: prevFilter }),
          Invoice.countDocuments({ createdAt: prevFilter }),
          User.countDocuments({ createdAt: prevFilter }),
          Customer.countDocuments({ createdAt: prevFilter }),
        ]);

      summary.periodComparison = {
        previous: {
          loans: prevLoans,
          invoices: prevInvoices,
          users: prevUsers,
          customers: prevCustomers,
        },
        current: {
          loans: totalLoans,
          invoices: totalInvoices,
          users: totalUsers,
          customers: totalCustomers,
        },
        changes: {
          loans: pctChange(totalLoans, prevLoans),
          invoices: pctChange(totalInvoices, prevInvoices),
          users: pctChange(totalUsers, prevUsers),
          customers: pctChange(totalCustomers, prevCustomers),
        },
      };
    }

    return { summary, generatedAt: new Date().toISOString() };
  },
};

import { Organization } from "../organization/models/organization.model.ts";
import { User } from "../user/models/user.model.ts";
import { BillingEvent } from "../billing/models/billing_event.model.ts";
import { Loan } from "../loan/models/loan.model.ts";
import { Invoice } from "../invoice/models/invoice.model.ts";
import { SubscriptionType } from "../subscription_type/models/subscription_type.model.ts";

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
   * Gets user activity statistics.
   * Aggregated data only - no usernames, emails, or identifiable info.
   */
  async getUserActivity(periodMonths: number = 12): Promise<UserActivityStats> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - periodMonths);

    const [byRole, byStatus, growthTrend, avgUsersPerOrg] = await Promise.all([
      // User count by role
      User.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } },
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
};

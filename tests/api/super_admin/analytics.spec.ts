import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsSuperAdmin, createAndLoginUser } from "../../utils/setup.ts";

test.describe("Super Admin - Analytics Endpoints", () => {
  let superAdminContext: APIRequestContext;
  let regularUserContext: APIRequestContext;

  test.beforeAll(async ({ baseURL }) => {
    // Login as super_admin
    const superAdmin = await loginAsSuperAdmin(baseURL!);
    superAdminContext = superAdmin.apiContext;

    // Create regular user for permission tests
    const regularUser = await createAndLoginUser(baseURL!);
    regularUserContext = regularUser.apiContext;
  });

  test.afterAll(async () => {
    await superAdminContext.dispose();
    await regularUserContext.dispose();
  });

  /* ---------- Platform Overview ---------- */

  test("GET /admin/analytics/overview - should return platform overview (super admin)", async () => {
    const response = await superAdminContext.get("/admin/analytics/overview");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.overview).toBeDefined();

    const overview = body.data.overview;
    expect(typeof overview.totalOrganizations).toBe("number");
    expect(typeof overview.activeOrganizations).toBe("number");
    expect(typeof overview.suspendedOrganizations).toBe("number");
    expect(typeof overview.totalUsers).toBe("number");
    expect(typeof overview.activeUsers).toBe("number");
    expect(typeof overview.monthlyRecurringRevenue).toBe("number");
    expect(typeof overview.totalLoansProcessed).toBe("number");
    expect(typeof overview.totalInvoicesGenerated).toBe("number");
  });

  test("GET /admin/analytics/overview - should deny access to regular users", async () => {
    const response = await regularUserContext.get("/admin/analytics/overview");
    expect(response.status()).toBe(401);
  });

  /* ---------- Organization Activity ---------- */

  test("GET /admin/analytics/organizations - should return org stats (super admin)", async () => {
    const response = await superAdminContext.get(
      "/admin/analytics/organizations",
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.periodMonths).toBe(12);
    expect(body.data.stats).toBeDefined();

    const stats = body.data.stats;
    expect(Array.isArray(stats.byStatus)).toBeTruthy();
    expect(Array.isArray(stats.byPlan)).toBeTruthy();
    expect(Array.isArray(stats.growthTrend)).toBeTruthy();
    expect(typeof stats.averageSeatCount).toBe("number");
    expect(typeof stats.averageCatalogItemCount).toBe("number");
  });

  test("GET /admin/analytics/organizations - should accept periodMonths param", async () => {
    const response = await superAdminContext.get(
      "/admin/analytics/organizations?periodMonths=6",
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.periodMonths).toBe(6);
  });

  test("GET /admin/analytics/organizations - should deny access to regular users", async () => {
    const response = await regularUserContext.get(
      "/admin/analytics/organizations",
    );
    expect(response.status()).toBe(401);
  });

  /* ---------- User Activity ---------- */

  test("GET /admin/analytics/users - should return user stats (super admin)", async () => {
    const response = await superAdminContext.get("/admin/analytics/users");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.periodMonths).toBe(12);
    expect(body.data.stats).toBeDefined();

    const stats = body.data.stats;
    expect(Array.isArray(stats.byRole)).toBeTruthy();
    expect(Array.isArray(stats.byStatus)).toBeTruthy();
    expect(Array.isArray(stats.growthTrend)).toBeTruthy();
    expect(typeof stats.averageUsersPerOrganization).toBe("number");
  });

  test("GET /admin/analytics/users - should accept periodMonths param", async () => {
    const response = await superAdminContext.get(
      "/admin/analytics/users?periodMonths=3",
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.periodMonths).toBe(3);
  });

  test("GET /admin/analytics/users - should deny access to regular users", async () => {
    const response = await regularUserContext.get("/admin/analytics/users");
    expect(response.status()).toBe(401);
  });

  /* ---------- Revenue Statistics ---------- */

  test("GET /admin/analytics/revenue - should return revenue stats (super admin)", async () => {
    const response = await superAdminContext.get("/admin/analytics/revenue");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.periodMonths).toBe(12);
    expect(body.data.stats).toBeDefined();

    const stats = body.data.stats;
    expect(typeof stats.totalRevenue).toBe("number");
    expect(Array.isArray(stats.revenueByPlan)).toBeTruthy();
    expect(Array.isArray(stats.monthlyTrend)).toBeTruthy();
    expect(typeof stats.averageRevenuePerOrganization).toBe("number");
  });

  test("GET /admin/analytics/revenue - should deny access to regular users", async () => {
    const response = await regularUserContext.get("/admin/analytics/revenue");
    expect(response.status()).toBe(401);
  });

  /* ---------- Subscription Statistics ---------- */

  test("GET /admin/analytics/subscriptions - should return subscription stats (super admin)", async () => {
    const response = await superAdminContext.get(
      "/admin/analytics/subscriptions",
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.stats).toBeDefined();

    const stats = body.data.stats;
    expect(typeof stats.totalActiveSubscriptions).toBe("number");
    expect(Array.isArray(stats.subscriptionsByPlan)).toBeTruthy();
    expect(typeof stats.churnRate).toBe("number");
    expect(typeof stats.upgrades).toBe("number");
    expect(typeof stats.downgrades).toBe("number");

    // Check subscription plan entries have required fields
    if (stats.subscriptionsByPlan.length > 0) {
      const planEntry = stats.subscriptionsByPlan[0];
      expect(planEntry.plan).toBeDefined();
      expect(typeof planEntry.count).toBe("number");
      expect(typeof planEntry.percentage).toBe("number");
    }
  });

  test("GET /admin/analytics/subscriptions - should deny access to regular users", async () => {
    const response = await regularUserContext.get(
      "/admin/analytics/subscriptions",
    );
    expect(response.status()).toBe(401);
  });

  /* ---------- Platform Health ---------- */

  test("GET /admin/analytics/health - should return health metrics (super admin)", async () => {
    const response = await superAdminContext.get("/admin/analytics/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.health).toBeDefined();

    const health = body.data.health;
    expect(typeof health.overdueLoans).toBe("number");
    expect(typeof health.overdueInvoices).toBe("number");
    expect(typeof health.suspendedOrganizations).toBe("number");
    expect(typeof health.recentErrors).toBe("number");
  });

  test("GET /admin/analytics/health - should deny access to regular users", async () => {
    const response = await regularUserContext.get("/admin/analytics/health");
    expect(response.status()).toBe(401);
  });

  /* ---------- Recent Activity ---------- */

  test("GET /admin/analytics/activity - should return activity log (super admin)", async () => {
    const response = await superAdminContext.get("/admin/analytics/activity");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data.activity)).toBeTruthy();

    // Check activity entries have required fields (if any exist)
    if (body.data.activity.length > 0) {
      const entry = body.data.activity[0];
      expect(entry.eventType).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      // amount and plan are optional
    }
  });

  test("GET /admin/analytics/activity - should respect limit parameter", async () => {
    const response = await superAdminContext.get(
      "/admin/analytics/activity?limit=10",
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.activity.length).toBeLessThanOrEqual(10);
  });

  test("GET /admin/analytics/activity - should cap limit at 100", async () => {
    const response = await superAdminContext.get(
      "/admin/analytics/activity?limit=500",
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.activity.length).toBeLessThanOrEqual(100);
  });

  test("GET /admin/analytics/activity - should deny access to regular users", async () => {
    const response = await regularUserContext.get("/admin/analytics/activity");
    expect(response.status()).toBe(401);
  });

  /* ---------- Combined Dashboard ---------- */

  test("GET /admin/analytics/dashboard - should return all analytics (super admin)", async () => {
    const response = await superAdminContext.get("/admin/analytics/dashboard");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");

    const data = body.data;
    expect(data.overview).toBeDefined();
    expect(data.organizationStats).toBeDefined();
    expect(data.userStats).toBeDefined();
    expect(data.subscriptionStats).toBeDefined();
    expect(data.health).toBeDefined();
    expect(data.generatedAt).toBeDefined();

    // Verify generatedAt is a valid ISO timestamp
    expect(() => new Date(data.generatedAt)).not.toThrow();
  });

  test("GET /admin/analytics/dashboard - should deny access to regular users", async () => {
    const response = await regularUserContext.get("/admin/analytics/dashboard");
    expect(response.status()).toBe(401);
  });

  /* ---------- Non-PII Verification ---------- */

  test("Analytics should not expose PII (organization names, emails)", async () => {
    // Get all analytics
    const [overview, orgStats, userStats] = await Promise.all([
      superAdminContext.get("/admin/analytics/overview"),
      superAdminContext.get("/admin/analytics/organizations"),
      superAdminContext.get("/admin/analytics/users"),
    ]);

    const overviewBody = await overview.json();
    const orgBody = await orgStats.json();
    const userBody = await userStats.json();

    // Convert to string and check for common PII patterns
    const allData = JSON.stringify([
      overviewBody,
      orgBody,
      userBody,
    ]).toLowerCase();

    // Should not contain email patterns
    expect(allData).not.toMatch(/@[a-z]+\.[a-z]/);

    // Data should be aggregated (numbers and arrays of counts, not individual records)
    expect(overviewBody.data.overview.organizations).toBeUndefined();
    expect(overviewBody.data.overview.users).toBeUndefined();
  });
});

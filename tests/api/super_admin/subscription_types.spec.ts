import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsSuperAdmin, createAndLoginUser } from "../../utils/setup.ts";

test.describe("Super Admin - Subscription Types Management", () => {
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

  /* ---------- Public Endpoints ---------- */

  test("GET /subscription-types - should list active subscription types (public)", async () => {
    const response = await superAdminContext.get("/subscription-types");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data.subscriptionTypes)).toBeTruthy();

    // Default seeded types should exist
    const plans = body.data.subscriptionTypes.map(
      (st: { plan: string }) => st.plan,
    );
    expect(plans).toContain("free");
    expect(plans).toContain("starter");
  });

  test("GET /subscription-types/:plan - should get specific plan", async () => {
    const response = await superAdminContext.get("/subscription-types/starter");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.plan).toBe("starter");
    expect(body.data.displayName).toBeDefined();
    expect(body.data.billingModel).toMatch(/^(fixed|dynamic)$/);
  });

  test("GET /subscription-types/:plan - should return 404 for non-existent plan", async () => {
    const response = await superAdminContext.get(
      "/subscription-types/nonexistent_plan_xyz",
    );
    expect(response.status()).toBe(404);
  });

  /* ---------- Super Admin Only Endpoints ---------- */

  test("GET /subscription-types/admin/all - should list all types including inactive (super admin)", async () => {
    const response = await superAdminContext.get(
      "/subscription-types/admin/all",
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data.subscriptionTypes)).toBeTruthy();
  });

  test("GET /subscription-types/admin/all - should deny access to regular users", async () => {
    const response = await regularUserContext.get(
      "/subscription-types/admin/all",
    );
    expect(response.status()).toBe(401);
  });

  test("POST /subscription-types - should create new subscription type (super admin)", async () => {
    const uniquePlan = `test_plan_${Date.now()}`;
    const newPlan = {
      plan: uniquePlan,
      displayName: "Test Plan",
      description: "A test subscription plan",
      billingModel: "dynamic",
      baseCost: 1999, // $19.99 in cents
      pricePerSeat: 499, // $4.99 in cents
      maxSeats: 10,
      maxCatalogItems: 50,
      features: ["Feature 1", "Feature 2", "Feature 3"],
    };

    const response = await superAdminContext.post("/subscription-types", {
      data: newPlan,
    });

    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.subscriptionType.plan).toBe(uniquePlan);
    expect(body.data.subscriptionType.displayName).toBe("Test Plan");
    expect(body.data.subscriptionType.billingModel).toBe("dynamic");
    expect(body.data.subscriptionType.baseCost).toBe(1999);
    expect(body.data.subscriptionType.status).toBe("active");
  });

  test("POST /subscription-types - should deny creation to regular users", async () => {
    const response = await regularUserContext.post("/subscription-types", {
      data: {
        plan: "hacker_plan",
        displayName: "Hacker Plan",
        billingModel: "fixed",
        baseCost: 0,
        pricePerSeat: 0,
      },
    });

    expect(response.status()).toBe(401);
  });

  test("POST /subscription-types - should reject invalid plan name", async () => {
    const response = await superAdminContext.post("/subscription-types", {
      data: {
        plan: "Invalid Plan Name!", // Contains spaces and special chars
        displayName: "Invalid",
        billingModel: "fixed",
        baseCost: 100,
        pricePerSeat: 0,
      },
    });

    expect(response.status()).toBe(400);
  });

  test("POST /subscription-types - should reject duplicate plan", async () => {
    // Try to create a plan that already exists
    const response = await superAdminContext.post("/subscription-types", {
      data: {
        plan: "starter", // Already exists from seeding
        displayName: "Duplicate Starter",
        billingModel: "fixed",
        baseCost: 100,
        pricePerSeat: 0,
      },
    });

    expect(response.status()).toBe(409); // Conflict
  });

  test("PATCH /subscription-types/:plan - should update subscription type (super admin)", async () => {
    // First create a plan to update
    const uniquePlan = `update_test_${Date.now()}`;
    await superAdminContext.post("/subscription-types", {
      data: {
        plan: uniquePlan,
        displayName: "Original Name",
        billingModel: "fixed",
        baseCost: 1000,
        pricePerSeat: 0,
      },
    });

    // Update the plan
    const response = await superAdminContext.patch(
      `/subscription-types/${uniquePlan}`,
      {
        data: {
          displayName: "Updated Name",
          baseCost: 2000,
          features: ["New Feature"],
        },
      },
    );

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.subscriptionType.displayName).toBe("Updated Name");
    expect(body.data.subscriptionType.baseCost).toBe(2000);
    expect(body.data.subscriptionType.features).toContain("New Feature");
  });

  test("PATCH /subscription-types/:plan - should deny update to regular users", async () => {
    const response = await regularUserContext.patch(
      "/subscription-types/starter",
      {
        data: { baseCost: 0 },
      },
    );

    expect(response.status()).toBe(401);
  });

  test("DELETE /subscription-types/:plan - should deactivate subscription type (super admin)", async () => {
    // First create a plan to deactivate
    const uniquePlan = `delete_test_${Date.now()}`;
    await superAdminContext.post("/subscription-types", {
      data: {
        plan: uniquePlan,
        displayName: "To Be Deleted",
        billingModel: "fixed",
        baseCost: 100,
        pricePerSeat: 0,
      },
    });

    // Deactivate the plan
    const response = await superAdminContext.delete(
      `/subscription-types/${uniquePlan}`,
    );

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.message).toContain("deactivated");

    // Verify it's no longer in public list
    const listResponse = await superAdminContext.get("/subscription-types");
    const listBody = await listResponse.json();
    const plans = listBody.data.subscriptionTypes.map(
      (st: { plan: string }) => st.plan,
    );
    expect(plans).not.toContain(uniquePlan);
  });

  test("DELETE /subscription-types/:plan - should deny deletion to regular users", async () => {
    const response = await regularUserContext.delete(
      "/subscription-types/starter",
    );

    expect(response.status()).toBe(401);
  });

  /* ---------- Cost Calculation (Public) ---------- */

  test("POST /subscription-types/:plan/calculate-cost - should calculate cost", async () => {
    const response = await superAdminContext.post(
      "/subscription-types/starter/calculate-cost",
      {
        data: { seatCount: 5 },
      },
    );

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.plan).toBe("starter");
    expect(body.data.seatCount).toBe(5);
    expect(typeof body.data.baseCost).toBe("number");
    expect(typeof body.data.seatCost).toBe("number");
    expect(typeof body.data.totalCost).toBe("number");
    expect(body.data.currency).toBe("usd");
  });

  test("POST /subscription-types/:plan/calculate-cost - should reject invalid seat count", async () => {
    const response = await superAdminContext.post(
      "/subscription-types/starter/calculate-cost",
      {
        data: { seatCount: -1 },
      },
    );

    expect(response.status()).toBe(400);
  });
});

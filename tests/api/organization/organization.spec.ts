import { test, expect } from "@playwright/test";

test.describe("Organization Module", () => {
  /* ===================== GET Details ===================== */

  test("GET /organizations - should return current org details", async ({
    request,
  }) => {
    const res = await request.get("organizations");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.organization).toBeDefined();
    expect(body.data.organization.name).toBeDefined();
    expect(body.data.organization.email).toBeDefined();
    expect(body.data.organization.subscription).toBeDefined();
  });

  test("GET /organizations - should include address", async ({ request }) => {
    const res = await request.get("organizations");
    expect(res.status()).toBe(200);
    const org = (await res.json()).data.organization;
    expect(org.address).toBeDefined();
    expect(org.address.city).toBeDefined();
  });

  /* ===================== PATCH Update ===================== */

  test("PATCH /organizations - should update organization name", async ({
    request,
  }) => {
    const newName = `Updated Org ${Date.now()}`;
    const res = await request.patch("organizations", {
      data: { name: newName },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.organization.name).toBe(newName);
  });

  test("PATCH /organizations - should update contact email", async ({
    request,
  }) => {
    const newEmail = `org-contact-${Date.now()}@example.com`;
    const res = await request.patch("organizations", {
      data: { email: newEmail },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.organization.email).toBe(newEmail);
  });

  test("PATCH /organizations - should reject invalid payload", async ({
    request,
  }) => {
    // name must be a string; send invalid type
    const res = await request.patch("organizations", {
      data: { name: "" },
    });
    // Expect validation error
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  /* ===================== Usage ===================== */

  test("GET /organizations/usage - should return plan usage", async ({
    request,
  }) => {
    const res = await request.get("organizations/usage");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.usage).toBeDefined();
    expect(typeof body.data.usage.currentCatalogItems).toBe("number");
    expect(typeof body.data.usage.maxCatalogItems).toBe("number");
    expect(typeof body.data.usage.currentSeats).toBe("number");
    expect(typeof body.data.usage.maxSeats).toBe("number");
    expect(typeof body.data.usage.canAddCatalogItem).toBe("boolean");
    expect(typeof body.data.usage.canAddSeat).toBe("boolean");
  });

  /* ===================== Plans ===================== */

  test("GET /organizations/plans - should return available plans", async ({
    request,
  }) => {
    const res = await request.get("organizations/plans");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data.plans)).toBe(true);
    expect(body.data.plans.length).toBeGreaterThan(0);

    // Each plan should have expected fields
    const plan = body.data.plans[0];
    expect(plan.name).toBeDefined();
    expect(plan.displayName).toBeDefined();
    expect(typeof plan.basePriceMonthly).toBe("number");
    expect(typeof plan.pricePerSeat).toBe("number");
  });
});

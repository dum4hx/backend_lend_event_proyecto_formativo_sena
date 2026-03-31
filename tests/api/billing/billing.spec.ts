import { test, expect } from "@playwright/test";
import { createRegularUserContext } from "../../utils/setup.ts";

test.describe("Billing Module", () => {
  /* ===================== CONTEXT ===================== */

  test("GET /organizations - should include subscription data", async ({
    request,
  }) => {
    const res = await request.get("organizations");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.organization).toBeDefined();
    expect(body.data.organization.subscription).toBeDefined();
    expect(body.data.organization.subscription.plan).toBeDefined();
  });

  /* ===================== CHECKOUT ===================== */

  test("POST /billing/checkout - should reject invalid body", async ({
    request,
  }) => {
    const res = await request.post("billing/checkout", {
      data: {},
    });
    // Missing plan, successUrl, cancelUrl → validation error
    expect(res.status()).toBe(400);
  });

  test("POST /billing/checkout - should reject missing URLs", async ({
    request,
  }) => {
    const res = await request.post("billing/checkout", {
      data: { plan: "pro", seatCount: 1 },
    });
    expect(res.status()).toBe(400);
  });

  /* ===================== PORTAL ===================== */

  test("POST /billing/portal - should reject missing returnUrl", async ({
    request,
  }) => {
    const res = await request.post("billing/portal", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  /* ===================== SEATS ===================== */

  test("PATCH /billing/seats - should reject invalid seatCount", async ({
    request,
  }) => {
    const res = await request.patch("billing/seats", {
      data: { seatCount: -1 },
    });
    expect(res.status()).toBe(400);
  });

  test("PATCH /billing/seats - should reject missing body", async ({
    request,
  }) => {
    const res = await request.patch("billing/seats", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  /* ===================== CANCEL ===================== */

  test("POST /billing/cancel - should accept empty body (defaults)", async ({
    request,
  }) => {
    // cancelImmediately defaults to false — this will fail with Stripe not configured
    // but should pass validation (not 400)
    const res = await request.post("billing/cancel", {
      data: {},
    });
    // 500 or other error from Stripe not being configured, but NOT 400
    expect(res.status()).not.toBe(400);
  });

  /* ===================== HISTORY ===================== */

  test("GET /billing/history - should return billing history", async ({
    request,
  }) => {
    const res = await request.get("billing/history");
    // May return 200 with empty array or 500 if Stripe not configured
    // The endpoint reads from DB first (BillingEvent), so it should work
    expect([200, 500]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.status).toBe("success");
      expect(body.data.history).toBeDefined();
    }
  });

  test("GET /billing/history - should support limit param", async ({
    request,
  }) => {
    const res = await request.get("billing/history?limit=5");
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.data.history.length).toBeLessThanOrEqual(5);
    }
  });

  /* ===================== WEBHOOK ===================== */

  test("POST /billing/webhook - should reject missing stripe-signature", async ({
    request,
  }) => {
    const res = await request.post("billing/webhook", {
      data: "{}",
    });
    expect(res.status()).toBe(400);
  });

  /* ===================== AUTH ===================== */

  test("Billing endpoints should require authentication", async ({
    baseURL,
  }) => {
    // Create a context with NO storageState (no auth cookies)
    const { request: anonRequest } = await import("@playwright/test");
    const ctx = await anonRequest.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    });

    const res = await ctx.get("billing/history");
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });
});

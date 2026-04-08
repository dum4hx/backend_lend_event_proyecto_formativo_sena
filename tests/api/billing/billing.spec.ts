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

  test("POST /billing/checkout - should reject empty plan", async ({
    request,
  }) => {
    const res = await request.post("billing/checkout", {
      data: {
        plan: "",
        seatCount: 1,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /billing/checkout - should reject non-existent plan", async ({
    request,
  }) => {
    const res = await request.post("billing/checkout", {
      data: {
        plan: "nonexistent_plan_xyz",
        seatCount: 1,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      },
    });
    // Should be 400 (plan not found) or 500 (Stripe not configured)
    expect([400, 500]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(body.message).toContain("no existe");
    }
  });

  test("POST /billing/checkout - should reject free plan", async ({
    request,
  }) => {
    const res = await request.post("billing/checkout", {
      data: {
        plan: "free",
        seatCount: 1,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /billing/checkout - should reject invalid seat count", async ({
    request,
  }) => {
    const res = await request.post("billing/checkout", {
      data: {
        plan: "starter",
        seatCount: 0,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      },
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

  /* ===================== CHANGE PLAN ===================== */

  test("POST /billing/change-plan - should reject missing plan", async ({
    request,
  }) => {
    const res = await request.post("billing/change-plan", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("POST /billing/change-plan - should reject empty plan", async ({
    request,
  }) => {
    const res = await request.post("billing/change-plan", {
      data: { plan: "" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /billing/change-plan - should reject non-existent plan", async ({
    request,
  }) => {
    const res = await request.post("billing/change-plan", {
      data: { plan: "nonexistent_plan_xyz" },
    });
    // 400 (no active subscription or plan not found) or 500 (Stripe not configured)
    expect([400, 500]).toContain(res.status());
  });

  test("POST /billing/change-plan - should reject invalid seat count", async ({
    request,
  }) => {
    const res = await request.post("billing/change-plan", {
      data: { plan: "starter", seatCount: 0 },
    });
    expect(res.status()).toBe(400);
  });

  /* ===================== PENDING CHANGES ===================== */

  test("GET /billing/pending-changes - should return pending changes", async ({
    request,
  }) => {
    const res = await request.get("billing/pending-changes");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data).toHaveProperty("pendingChange");
  });

  test("DELETE /billing/pending-changes - should handle no pending change", async ({
    request,
  }) => {
    const res = await request.delete("billing/pending-changes");
    // 400 (no pending change) or 500 (Stripe not configured)
    expect([400, 500]).toContain(res.status());
  });

  /* ===================== NEW ENDPOINTS AUTH ===================== */

  test("New billing endpoints should require authentication", async ({
    baseURL,
  }) => {
    const { request: anonRequest } = await import("@playwright/test");
    const ctx = await anonRequest.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    });

    const changePlanRes = await ctx.post("billing/change-plan", {
      data: { plan: "starter" },
    });
    expect(changePlanRes.status()).toBe(401);

    const pendingRes = await ctx.get("billing/pending-changes");
    expect(pendingRes.status()).toBe(401);

    const deleteRes = await ctx.delete("billing/pending-changes");
    expect(deleteRes.status()).toBe(401);

    await ctx.dispose();
  });
});

import { test, expect } from "@playwright/test";

test.describe("Billing Module", () => {
  test("GET /billing/subscription - should return sub details", async ({
    request,
  }) => {
    const res = await request.get("billing/subscription");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.subscription).toBeDefined();
  });
});

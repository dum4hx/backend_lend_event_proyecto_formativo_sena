import { test, expect } from "@playwright/test";

test.describe("Billing Module", () => {
  test("GET /organizations - should return org details including subscription", async ({
    request,
  }) => {
    const res = await request.get("organizations");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.organization).toBeDefined();
    expect(body.data.organization.subscription).toBeDefined();
  });
});

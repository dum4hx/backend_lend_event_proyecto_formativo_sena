import { test, expect } from "@playwright/test";

test.describe("Loans Module", () => {
  test("GET /loans - should list active loans", async ({ request }) => {
    const res = await request.get("loans");
    expect(res.status()).toBe(200);
  });
});

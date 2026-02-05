import { test, expect, type APIRequestContext } from "@playwright/test";
import { createAndLoginUser } from "../../utils/setup.ts";

test.describe("Billing Module", () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ baseURL }) => {
    const setup = await createAndLoginUser(baseURL!);
    apiContext = setup.apiContext;
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test("GET /billing/subscription - should return sub details", async () => {
    const res = await apiContext.get("/billing/subscription");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.subscription).toBeDefined();
  });
});

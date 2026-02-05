import { test, expect, type APIRequestContext } from "@playwright/test";
import { createAndLoginUser } from "../../utils/setup.ts";

test.describe("Invoices Module", () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ baseURL }) => {
    const setup = await createAndLoginUser(baseURL!);
    apiContext = setup.apiContext;
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test("GET /invoices - should list invoices", async () => {
    const res = await apiContext.get("/invoices");
    expect(res.status()).toBe(200);
  });
});

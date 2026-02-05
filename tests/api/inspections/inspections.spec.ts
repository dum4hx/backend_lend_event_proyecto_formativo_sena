import { test, expect, type APIRequestContext } from "@playwright/test";
import { createAndLoginUser } from "../../utils/setup.ts";

test.describe("Inspections Module", () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ baseURL }) => {
    const setup = await createAndLoginUser(baseURL!);
    apiContext = setup.apiContext;
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test("GET /inspections - should list inspections", async () => {
    const res = await apiContext.get("/inspections");
    expect(res.status()).toBe(200);
  });
});

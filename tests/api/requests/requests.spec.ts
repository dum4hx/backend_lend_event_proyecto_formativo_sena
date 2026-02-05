import { test, expect, type APIRequestContext } from "@playwright/test";
import { createAndLoginUser } from "../../utils/setup.ts";

test.describe("Requests Module", () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ baseURL }) => {
    const setup = await createAndLoginUser(baseURL!);
    apiContext = setup.apiContext;
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test("GET /requests - should list requests", async () => {
    const res = await apiContext.get("/requests");
    expect(res.status()).toBe(200);
  });

  /* 
    Full flow would require:
    1. Create Customer
    2. Create Materials
    3. Create Request with those IDs
    4. Approve, etc.
  */
});

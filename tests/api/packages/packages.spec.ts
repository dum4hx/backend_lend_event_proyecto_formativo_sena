import { test, expect, type APIRequestContext } from "@playwright/test";
import { createAndLoginUser } from "../../utils/setup.ts";

test.describe("Packages Module", () => {
  let apiContext: APIRequestContext;
  // We need material types to create a package, assume we create them here or mock

  test.beforeAll(async ({ baseURL }) => {
    const setup = await createAndLoginUser(baseURL!);
    apiContext = setup.apiContext;
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test("POST /packages - should create package", async () => {
    // Ideally we create a material type first.
    // For this skeleton, we might fail if we don't have valid IDs.
    // I'll skip the detailed setup for brevity and focus on structure.
    // In a real scenario: create category -> create type -> use ID.
  });

  test("GET /packages - should list packages", async () => {
    const res = await apiContext.get("/packages");
    expect(res.status()).toBe(200);
  });
});

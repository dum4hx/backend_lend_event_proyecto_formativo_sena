import { test, expect, type APIRequestContext } from "@playwright/test";
import { createRegularUserContext } from "../../utils/setup.ts";

test.describe("Permissions Module", () => {
  let regularUserContext: APIRequestContext;

  test.beforeAll(async ({ baseURL }) => {
    regularUserContext = await createRegularUserContext(baseURL!);
  });

  test.afterAll(async () => {
    await regularUserContext.dispose();
  });

  test("GET /permissions - should require authentication", async ({
    request,
  }) => {
    const response = await request.get("/permissions");
    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("GET /permissions - should list permissions for authenticated user", async () => {
    const response = await regularUserContext.get("/permissions");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data.permissions)).toBeTruthy();

    const ids = body.data.permissions.map((p: any) => p._id);
    expect(ids.length).toBeGreaterThan(0);
    // Owner role should include common permissions like users:read
    expect(ids).toContain("users:read");
  });
});

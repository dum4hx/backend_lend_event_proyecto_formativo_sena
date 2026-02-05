import { test, expect, type APIRequestContext } from "@playwright/test";
import { createAndLoginUser } from "../../utils/setup.ts";
import { generateRandomEmail } from "../../utils/helpers.ts";

test.describe("Users Module", () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ playwright, baseURL }) => {
    const setup = await createAndLoginUser(baseURL!);
    apiContext = setup.apiContext;
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test("GET /users - should list users", async () => {
    const response = await apiContext.get("users");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data.users)).toBeTruthy();
  });

  test("POST /users/invite - should invite a user", async () => {
    const inviteData = {
      name: { firstName: "Invited", firstSurname: "User" },
      email: generateRandomEmail(),
      phone: "+573009998877",
      role: "commercial_advisor",
    };

    const response = await apiContext.post("/users/invite", {
      data: inviteData,
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.user.email).toBe(inviteData.email);
    expect(body.data.user.status).toBe("invited");
  });

  // Additional tests: GET /:id, PATCH /:id, PATCH /:id/role, POST /:id/deactivate, POST /:id/reactivate
});

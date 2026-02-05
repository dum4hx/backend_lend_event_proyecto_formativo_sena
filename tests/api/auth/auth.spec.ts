import { test, expect } from "@playwright/test";
import { defaultOrgData, validateAuthCookies } from "../../utils/helpers.ts";

test.describe("Auth Module", () => {
  let createdUserEmail: string;
  let createdUserPassword: string;

  test("POST /auth/register Then POST /auth/login should register and login the newly created user ", async ({
    request,
  }) => {
    const payload = defaultOrgData();
    createdUserEmail = payload.owner.email;
    createdUserPassword = payload.owner.password;

    // Register step
    await test.step("Register", async () => {
      const response = await request.post("auth/register", {
        data: payload,
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.status).toBe("success");
      expect(body.data.user.email).toBe(createdUserEmail);
      expect(body.data.organization).toBeDefined();
    });

    // Login step
    await test.step("Login", async () => {
      const response = await request.post("auth/login", {
        data: {
          email: createdUserEmail,
          password: createdUserPassword,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("success");
      expect(body.data.user.email).toBe(createdUserEmail);

      // Validate cookies are set
      validateAuthCookies(response, ["access_token", "refresh_token"]);

      // Save authentication state for subsequent tests
      await request.storageState({
        path: "tests/utils/auth/storageState.json",
      });
    });
  });

  test("GET /auth/me - should return current user details", async ({
    request,
  }) => {
    // Login to get session
    const loginRes = await request.post("auth/login", {
      data: {
        email: createdUserEmail,
        password: createdUserPassword,
      },
    });

    // request context should store cookies automatically from the login response
    const response = await request.get("auth/me");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.user.email).toBe(createdUserEmail);
  });

  // Additional tests for logout, refresh...
});

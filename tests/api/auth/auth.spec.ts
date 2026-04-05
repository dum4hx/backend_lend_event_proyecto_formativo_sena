import { test, expect } from "@playwright/test";
import { defaultOrgData, validateAuthCookies } from "../../utils/helpers.ts";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

test.describe.serial("Auth Module", () => {
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

      expect(response.status()).toBe(202);
      const body = await response.json();
      expect(body.status).toBe("success");
      expect(body.data.user.email).toBe(createdUserEmail);
      expect(body.data.organization).toBeDefined();
    });

    // Verify Email step (using hardcoded OTP for test environment)
    await test.step("Verify Email", async () => {
      const response = await request.post("auth/verify-email", {
        data: {
          email: createdUserEmail,
          code: "123456",
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.status).toBe("success");
      expect(body.data.user.email).toBe(createdUserEmail);
    });

    // Login step (now returns pending OTP instead of tokens)
    await test.step("Login - receive OTP pending", async () => {
      const response = await request.post("auth/login", {
        data: {
          email: createdUserEmail,
          password: createdUserPassword,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("success");
      expect(body.data.pendingOtp).toBe(true);
      expect(body.data.email).toBe(createdUserEmail);
    });

    // Verify Login OTP step (completes the 2FA login)
    await test.step("Verify Login OTP - complete login", async () => {
      const response = await request.post("auth/verify-login-otp", {
        data: {
          email: createdUserEmail,
          code: "123456",
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("success");
      expect(body.data.user.email).toBe(createdUserEmail);
      expect(body.data.permissions).toBeDefined();

      // First login should include backup codes
      expect(body.data.backupCodes).toBeDefined();
      expect(body.data.backupCodes.length).toBe(10);

      // Validate cookies are set
      validateAuthCookies(response, ["access_token", "refresh_token"]);

      // Save authentication state for subsequent tests
      const storageStatePath = "tests/utils/auth/storageState.json";
      mkdirSync(dirname(storageStatePath), { recursive: true });
      await request.storageState({
        path: storageStatePath,
      });
    });
  });

  test("GET /auth/me - should return current user details", async ({
    request,
  }) => {
    const response = await request.get("auth/me");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.user.email).toBe(createdUserEmail);
  });

  // Additional tests for logout, refresh...
});

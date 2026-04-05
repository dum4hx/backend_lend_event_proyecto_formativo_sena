import { test, expect } from "@playwright/test";
import { defaultOrgData, validateAuthCookies } from "../../utils/helpers.ts";

/**
 * Tests for mandatory email-based two-factor authentication.
 * Covers OTP verification, resend, backup codes, and error paths.
 */
test.describe.serial("Two-Factor Authentication", () => {
  let userEmail: string;
  let userPassword: string;
  let backupCodes: string[];

  test("setup: register and verify a new user", async ({ request }) => {
    const payload = defaultOrgData();
    userEmail = payload.owner.email;
    userPassword = payload.owner.password;

    const registerRes = await request.post("auth/register", {
      data: payload,
    });
    expect(registerRes.status()).toBe(202);

    const verifyRes = await request.post("auth/verify-email", {
      data: { email: userEmail, code: "123456" },
    });
    expect(verifyRes.status()).toBe(201);
  });

  test("POST /auth/login returns pending OTP status (no cookies)", async ({
    request,
  }) => {
    const response = await request.post("auth/login", {
      data: { email: userEmail, password: userPassword },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.pendingOtp).toBe(true);
    expect(body.data.email).toBe(userEmail);

    // No auth cookies should be set at this point
    const headers = response.headersArray();
    const setCookies = headers
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    const hasAccessToken = setCookies.some((c) =>
      c.startsWith("access_token="),
    );
    expect(hasAccessToken).toBe(false);
  });

  test("POST /auth/verify-login-otp with invalid code returns 400", async ({
    request,
  }) => {
    const response = await request.post("auth/verify-login-otp", {
      data: { email: userEmail, code: "000000" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.details?.code ?? body.code).toBeDefined();
  });

  test("POST /auth/verify-login-otp with correct code issues cookies and backup codes", async ({
    request,
  }) => {
    // First, trigger a fresh OTP by logging in
    const loginRes = await request.post("auth/login", {
      data: { email: userEmail, password: userPassword },
    });
    expect(loginRes.status()).toBe(200);

    const response = await request.post("auth/verify-login-otp", {
      data: { email: userEmail, code: "123456" },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.user.email).toBe(userEmail);
    expect(body.data.permissions).toBeDefined();

    // First 2FA login should include backup codes
    expect(body.data.backupCodes).toBeDefined();
    expect(body.data.backupCodes.length).toBe(10);
    backupCodes = body.data.backupCodes;

    validateAuthCookies(response, ["access_token", "refresh_token"]);
  });

  test("Second login should NOT return backup codes again", async ({
    request,
  }) => {
    // Login again
    const loginRes = await request.post("auth/login", {
      data: { email: userEmail, password: userPassword },
    });
    expect(loginRes.status()).toBe(200);

    const otpRes = await request.post("auth/verify-login-otp", {
      data: { email: userEmail, code: "123456" },
    });

    expect(otpRes.status()).toBe(200);
    const body = await otpRes.json();
    expect(body.data.backupCodes).toBeUndefined();
  });

  test("POST /auth/verify-backup-code with valid backup code issues cookies", async ({
    request,
  }) => {
    // Login to trigger OTP (we'll bypass OTP with backup code)
    const loginRes = await request.post("auth/login", {
      data: { email: userEmail, password: userPassword },
    });
    expect(loginRes.status()).toBe(200);

    const response = await request.post("auth/verify-backup-code", {
      data: { email: userEmail, backupCode: backupCodes[0] },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.user.email).toBe(userEmail);
    expect(body.data.remainingBackupCodes).toBe(9);

    validateAuthCookies(response, ["access_token", "refresh_token"]);
  });

  test("POST /auth/verify-backup-code with already-used code returns 400", async ({
    request,
  }) => {
    // Login again
    await request.post("auth/login", {
      data: { email: userEmail, password: userPassword },
    });

    const response = await request.post("auth/verify-backup-code", {
      data: { email: userEmail, backupCode: backupCodes[0] },
    });

    expect(response.status()).toBe(400);
  });

  test("POST /auth/resend-login-otp sends a new OTP", async ({ request }) => {
    const response = await request.post("auth/resend-login-otp", {
      data: { email: userEmail, password: userPassword },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");

    // And verifying with the test OTP should still work
    const otpRes = await request.post("auth/verify-login-otp", {
      data: { email: userEmail, code: "123456" },
    });
    expect(otpRes.status()).toBe(200);
  });

  test("POST /auth/resend-login-otp with wrong password returns 401", async ({
    request,
  }) => {
    const response = await request.post("auth/resend-login-otp", {
      data: { email: userEmail, password: "WrongPassword1!" },
    });

    expect(response.status()).toBe(401);
  });

  test("POST /auth/login with invalid credentials returns 401", async ({
    request,
  }) => {
    const response = await request.post("auth/login", {
      data: { email: userEmail, password: "WrongPassword1!" },
    });

    expect(response.status()).toBe(401);
  });

  test("POST /auth/verify-login-otp without prior login returns 400", async ({
    request,
  }) => {
    const response = await request.post("auth/verify-login-otp", {
      data: { email: "nonexistent@example.com", code: "123456" },
    });

    expect(response.status()).toBe(400);
  });
});

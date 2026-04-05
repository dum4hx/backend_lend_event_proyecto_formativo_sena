import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ADMIN_STORAGE_STATE = "tests/utils/auth/adminStorageState.json";

test("Login as super admin and save storage state", async ({ request }) => {
  const email = process.env.SUPER_ADMIN_EMAIL ?? "superadmin@test.local";
  const password = process.env.SUPER_ADMIN_PASSWORD ?? "SuperAdmin123!";

  // Step 1: Login (triggers OTP)
  const loginRes = await request.post("auth/login", {
    data: { email, password },
  });

  if (!loginRes.ok()) {
    throw new Error(
      `Failed to login as super_admin: ${await loginRes.text()}. ` +
        `Ensure super_admin account exists with email: ${email}`,
    );
  }

  // Step 2: Verify login OTP (test env uses deterministic "123456")
  const otpRes = await request.post("auth/verify-login-otp", {
    data: { email, code: "123456" },
  });

  if (!otpRes.ok()) {
    throw new Error(
      `Failed to verify 2FA OTP for super_admin: ${await otpRes.text()}`,
    );
  }

  mkdirSync(dirname(ADMIN_STORAGE_STATE), { recursive: true });
  await request.storageState({ path: ADMIN_STORAGE_STATE });
});

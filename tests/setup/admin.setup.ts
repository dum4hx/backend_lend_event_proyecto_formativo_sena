import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ADMIN_STORAGE_STATE = "tests/utils/auth/adminStorageState.json";

test("Login as super admin and save storage state", async ({ request }) => {
  const email = process.env.SUPER_ADMIN_EMAIL ?? "superadmin@test.local";
  const password = process.env.SUPER_ADMIN_PASSWORD ?? "SuperAdmin123!";

  const loginRes = await request.post("auth/login", {
    data: { email, password },
  });

  if (!loginRes.ok()) {
    throw new Error(
      `Failed to login as super_admin: ${await loginRes.text()}. ` +
        `Ensure super_admin account exists with email: ${email}`,
    );
  }

  mkdirSync(dirname(ADMIN_STORAGE_STATE), { recursive: true });
  await request.storageState({ path: ADMIN_STORAGE_STATE });
});

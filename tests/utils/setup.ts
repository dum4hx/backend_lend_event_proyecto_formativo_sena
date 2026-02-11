import { type APIRequestContext, request } from "@playwright/test";
import { defaultOrgData } from "./helpers.ts";

export const createAndLoginUser = async (baseURL: string) => {
  const apiContext = await request.newContext({ baseURL });
  const userData = defaultOrgData();

  // Register
  const regRes = await apiContext.post("auth/register", {
    data: userData,
  });

  if (!regRes.ok()) {
    throw new Error(`Failed to register test user: ${await regRes.text()}`);
  }

  // Login
  const loginRes = await apiContext.post("auth/login", {
    data: {
      email: userData.owner.email,
      password: userData.owner.password,
    },
  });

  if (!loginRes.ok()) {
    throw new Error(`Failed to login test user: ${await loginRes.text()}`);
  }

  return { apiContext, user: userData.owner, org: userData.organization };
};

/**
 * Logs in as super_admin using test environment credentials.
 * Requires SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD environment variables
 * or uses default test credentials.
 */
export const loginAsSuperAdmin = async (baseURL: string) => {
  const apiContext = await request.newContext({ baseURL });

  const email = process.env.SUPER_ADMIN_EMAIL ?? "superadmin@test.local";
  const password = process.env.SUPER_ADMIN_PASSWORD ?? "SuperAdmin123!";

  const loginRes = await apiContext.post("auth/login", {
    data: { email, password },
  });

  if (!loginRes.ok()) {
    throw new Error(
      `Failed to login as super_admin: ${await loginRes.text()}. ` +
        `Ensure super_admin account exists with email: ${email}`,
    );
  }

  return { apiContext, email };
};

import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.test" });

const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "https://api.test.local/api/v1/";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await request.get('/')`. */
    baseURL: PLAYWRIGHT_BASE_URL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Use storage state for httpOnly cookie authentication */
    storageState: "tests/utils/auth/storageState.json",

    /* Ignore HTTPS errors for local/staging API certificates in test infrastructure */
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for major browsers */
  projects: [
    /* Setup: register + login, saves regular-user storageState */
    {
      name: "auth-setup",
      testDir: "./tests/api/auth",
      use: { storageState: undefined },
    },
    /* Setup: login as super_admin, saves admin storageState */
    {
      name: "admin-setup",
      testDir: "./tests/setup",
      testMatch: "**/*.setup.ts",
      use: { storageState: undefined },
    },
    /* Regular API tests — pre-loaded with regular-user cookies */
    {
      name: "api",
      testDir: "./tests/api",
      testIgnore: ["**/auth/**", "**/super_admin/**"],
      dependencies: ["auth-setup"],
    },
    /* Super-admin tests — pre-loaded with admin cookies */
    {
      name: "admin-api",
      testDir: "./tests/api/super_admin",
      testIgnore: ["**/super_admin.spec.ts"],
      dependencies: ["auth-setup", "admin-setup"],
      use: {
        storageState: "tests/utils/auth/adminStorageState.json",
      },
    },
  ],
});

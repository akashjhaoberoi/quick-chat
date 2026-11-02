import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration.
 *
 * - `tests/e2e/smoke.spec.ts` runs against any build, including one without
 *   Supabase credentials (setup mode).
 * - `tests/e2e/flows.spec.ts` drives real user journeys and requires a
 *   configured Supabase project plus E2E_SUPABASE_SERVICE_ROLE_KEY (see
 *   docs/TESTING.md). It skips itself otherwise.
 *
 * Set E2E_BASE_URL to test an already running deployment.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: [],
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "mobile-android", use: { ...devices["Pixel 7"] } },
    { name: "mobile-ios", use: { ...devices["iPhone 14"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${baseURL}/offline`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

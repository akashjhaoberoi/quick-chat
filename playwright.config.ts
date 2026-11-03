import { existsSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

loadEnvConfig(process.cwd());

/**
 * E2E configuration.
 *
 * - `tests/e2e/smoke.spec.ts` runs against any build, including one without
 *   Supabase credentials (setup mode).
 * - `tests/{auth,pwa,chat,admin,app}/*.spec.ts` drive real user journeys and
 *   create real users with the service-role key (see tests/support/fixtures.ts
 *   and docs/TESTING.md). They skip themselves without one.
 *
 * Set E2E_BASE_URL to test an already running deployment.
 */
const BRAVE = process.env.BRAVE_PATH ?? "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
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
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    // Real Brave with a fresh profile, so Shields (tracker and cookie blocking) run at their defaults.
    ...(existsSync(BRAVE) ? [{ name: "brave", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: BRAVE } } }] : []),
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

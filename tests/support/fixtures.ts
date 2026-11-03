import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Real users in a real Supabase project, created with the service-role key.
 * Locally the key comes from .env.local (loaded by playwright.config.ts);
 * against a deployment set E2E_SUPABASE_SERVICE_ROLE_KEY for that project,
 * otherwise the user-based suites skip themselves.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? (process.env.E2E_BASE_URL ? undefined : process.env.SUPABASE_SERVICE_ROLE_KEY);

export const canCreateUsers = Boolean(url && serviceKey);
export const NEEDS_USERS = "Needs a Supabase service-role key for the target project (see docs/TESTING.md)";

let adminClient: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  adminClient ??= createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

export type TestUser = { id: string; email: string; password: string; username: string };

export async function createUser(opts: { onboarded?: boolean } = {}): Promise<TestUser> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const username = `e2e_${suffix}`.slice(0, 20);
  const email = `${username}@example.com`;
  const password = `Pw-${suffix}-Aa1!`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: `E2E ${suffix}` },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  if (opts.onboarded !== false) {
    const { error: e } = await admin().from("profiles").update({ onboarded: true }).eq("id", data.user.id);
    if (e) throw new Error(`onboard: ${e.message}`);
  }
  return { id: data.user.id, email, password, username };
}

export async function deleteUsers(...users: (TestUser | undefined)[]) {
  for (const u of users) if (u) await admin().auth.admin.deleteUser(u.id).catch(() => undefined);
}

export async function makeFriends(a: TestUser, b: TestUser) {
  const [user_a, user_b] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  const { error } = await admin().from("friendships").insert({ user_a, user_b });
  if (error) throw new Error(`makeFriends: ${error.message}`);
}

/** Signs in through the real login form and waits until the app has loaded. */
export async function login(page: Page, user: TestUser, opts: { next?: string; remember?: boolean } = {}) {
  await page.goto(opts.next ? `/login?next=${encodeURIComponent(opts.next)}` : "/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  if (opts.remember === false) await page.getByLabel("Remember me").uncheck();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  // The app finishes its own post-sign-in navigation and refresh; don't race it.
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

/** Signs out through the UI: sidebar button on wide screens, account menu otherwise. */
export async function logoutViaUi(page: Page) {
  const sidebar = page.getByRole("button", { name: "Sign out" });
  const menu = page.getByRole("button", { name: "Account menu" });
  await expect(sidebar.or(menu).first()).toBeVisible({ timeout: 20_000 });
  if (await sidebar.isVisible()) {
    await sidebar.click();
  } else {
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
  }
  await page.waitForURL(/\/login/, { timeout: 30_000 });
}

/** The Supabase auth session stored in the (possibly chunked) sb-*-auth-token cookie. */
export async function sessionFromCookies(context: BrowserContext): Promise<{ access_token: string; refresh_token: string } | null> {
  const cookies = (await context.cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
  if (!cookies.length) return null;
  const value = cookies
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((c) => c.value)
    .join("");
  const raw = value.startsWith("base64-") ? Buffer.from(value.slice(7), "base64url").toString("utf8") : decodeURIComponent(value);
  return JSON.parse(raw);
}

/** Collects console errors and uncaught exceptions, ignoring expected network noise. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Expected: 401/403/404 resource responses on purpose-built negative paths.
    if (/Failed to load resource: the server responded with a status of (401|403|404)/.test(text)) return;
    errors.push(text);
  });
  return errors;
}

export { expect };

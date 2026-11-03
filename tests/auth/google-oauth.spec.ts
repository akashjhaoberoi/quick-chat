import { test } from "@playwright/test";
import { canCreateUsers, createUser, deleteUsers, expect, login, NEEDS_USERS } from "../support/fixtures";

/**
 * Google OAuth up to Google's account chooser. Completing the Google login
 * itself needs a real Google account, which automated tests must not use;
 * that step is covered by the manual procedure in AUTHENTICATION_TEST_REPORT.md.
 */
test.describe("Google sign-in", () => {
  test("starts one PKCE flow that returns to this site's /auth/callback", async ({ page, context, baseURL, browserName }) => {
    const authorize: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/auth/v1/authorize")) authorize.push(r.url());
    });
    // Stop at Supabase's authorize endpoint; whether Google is enabled is checked below.
    await page.route("**/auth/v1/authorize**", (route) => route.fulfill({ status: 200, body: "stub" }));
    await page.goto("/login?next=%2Ffriends");
    const button = page.getByRole("button", { name: "Continue with Google" });
    await button.dblclick();
    await page.waitForURL(/\/auth\/v1\/authorize/);
    expect(authorize).toHaveLength(1);
    const url = new URL(authorize[0]);
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("redirect_to")).toBe(`${new URL(baseURL!).origin}/auth/callback?next=%2Ffriends`);
    const verifier = (await context.cookies()).find((c) => c.name.endsWith("-auth-token-code-verifier"));
    expect(verifier, "PKCE verifier cookie must be stored before leaving the site").toBeTruthy();
    // Playwright's Windows WebKit build doesn't implement SameSite and reports "None".
    if (!(browserName === "webkit" && process.platform === "win32")) expect(verifier!.sameSite).toBe("Lax");
  });

  test("on a deployment, clicking the button reaches Google's sign-in page", async ({ page }) => {
    test.skip(!process.env.E2E_BASE_URL, "Runs against a deployment (E2E_BASE_URL)");
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL(/accounts\.google\.com/, { timeout: 30_000 });
    const params = new URL(page.url()).searchParams.toString() + page.url();
    expect(params).toContain("supabase.co");
  });

  test("callback without a code explains the problem instead of looping", async ({ page }) => {
    await page.goto("/auth/callback");
    await expect(page).toHaveURL(/\/login\?error=/);
    await expect(page.getByRole("alert").first()).toContainText(/missing its code/i);
  });

  test("callback with a provider error shows it", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied&error_description=User+cancelled");
    await expect(page.getByRole("alert").first()).toContainText(/cancelled/i);
  });

  test("callback started in another browser explains how to recover", async ({ page }) => {
    await page.goto("/auth/callback?code=0b4e2b9c-0000-4000-8000-000000000000");
    await expect(page).toHaveURL(/\/login\?error=/);
    await expect(page.getByRole("alert").first()).toContainText(/different browser|try again/i);
  });

  test("Back from Google re-enables the button (back/forward cache)", async ({ page }) => {
    await page.route("**/auth/v1/authorize**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>google</p>" }));
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL(/\/auth\/v1\/authorize/);
    await page.goBack();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  test.describe("signed in", () => {
    test.skip(!canCreateUsers, NEEDS_USERS);
    test("a repeated callback for an already signed-in user continues into the app", async ({ page }) => {
      const user = await createUser();
      try {
        await login(page, user);
        await page.goto("/auth/callback?code=already-used&next=%2Ffriends");
        await expect(page).toHaveURL(/\/friends/);
      } finally {
        await deleteUsers(user);
      }
    });
  });
});

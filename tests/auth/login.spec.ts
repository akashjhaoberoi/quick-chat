import { test } from "@playwright/test";
import { canCreateUsers, createUser, deleteUsers, expect, login, NEEDS_USERS, trackErrors, type TestUser } from "../support/fixtures";

test.describe("email login", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  let user: TestUser;
  test.beforeAll(async () => {
    user = await createUser();
  });
  test.afterAll(async () => deleteUsers(user));

  test("signs in and lands in the app with the profile loaded", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, user);
    await expect(page).toHaveURL(/\/home/);
    await page.goto("/profile");
    await expect(page.getByText(`@${user.username}`).filter({ visible: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("wrong password shows an error and stays on the login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-1");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("protected page redirects to login and returns there after sign-in", async ({ page }) => {
    await page.goto("/friends");
    await expect(page).toHaveURL(/\/login\?next=%2Ffriends/);
    await login(page, user, { next: "/friends" });
    await expect(page).toHaveURL(/\/friends/);
  });

  test("signed-in visitors skip the login page", async ({ page }) => {
    await login(page, user);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/home/);
  });

  test("a single sign-in sends exactly one password grant", async ({ page }) => {
    let grants = 0;
    page.on("request", (r) => {
      if (r.url().includes("/auth/v1/token?grant_type=password")) grants += 1;
    });
    await login(page, user);
    expect(grants).toBe(1);
  });
});

test.describe("account state", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);

  test("not-yet-onboarded users are sent to onboarding", async ({ page }) => {
    const user = await createUser({ onboarded: false });
    try {
      await login(page, user);
      await expect(page).toHaveURL(/\/onboarding/);
    } finally {
      await deleteUsers(user);
    }
  });
});

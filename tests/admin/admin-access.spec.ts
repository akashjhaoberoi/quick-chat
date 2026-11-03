import { test } from "@playwright/test";
import { admin, canCreateUsers, createUser, deleteUsers, expect, login, NEEDS_USERS, type TestUser } from "../support/fixtures";

test.describe("admin access", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  let member: TestUser;
  let staff: TestUser;
  test.beforeAll(async () => {
    member = await createUser();
    staff = await createUser();
    const { error } = await admin().from("admin_roles").insert({ user_id: staff.id, role: "admin" });
    if (error) throw new Error(error.message);
  });
  test.afterAll(async () => deleteUsers(member, staff));

  test("anonymous visitors are sent to login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("regular users cannot open the console or call admin APIs", async ({ page }) => {
    await login(page, member);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/home/);
    for (const path of ["/api/admin/users", "/api/admin/stats", "/api/admin/audit-logs", "/api/admin/reports"]) {
      const res = await page.request.get(path);
      expect([401, 403], path).toContain(res.status());
    }
  });

  test("staff without two-factor sign-in are asked to enable it first", async ({ page }) => {
    test.skip(process.env.ADMIN_REQUIRE_MFA !== "true", "ADMIN_REQUIRE_MFA is off");
    await login(page, staff);
    await page.goto("/admin");
    await expect(page.getByText(/two-factor/i).first()).toBeVisible();
    const res = await page.request.get("/api/admin/users");
    expect([401, 403]).toContain(res.status());
  });
});

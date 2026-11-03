import { test, type Browser, type Page } from "@playwright/test";
import { admin, canCreateUsers, createUser, deleteUsers, expect, login, makeFriends, NEEDS_USERS, sessionFromCookies, type TestUser } from "../support/fixtures";

/** Consent-based location sharing in a private chat (browser Geolocation API, emulated). */
const SPOT = { latitude: 28.6139, longitude: 77.209 };

async function open(browser: Browser, user: TestUser, geo: "granted" | "denied"): Promise<Page> {
  const context = await browser.newContext(geo === "granted" ? { permissions: ["geolocation"], geolocation: SPOT } : { permissions: [] });
  const page = await context.newPage();
  await login(page, user);
  return page;
}

async function chatWith(page: Page, other: TestUser) {
  const res = await page.request.post("/api/conversations", { data: { type: "direct", userId: other.id } });
  const id = (await res.json()).data.id as string;
  await page.goto(`/chats/${id}`);
  return id;
}

async function openLocationSheet(page: Page) {
  await page.getByRole("button", { name: "Attach" }).click();
  await page.getByRole("menuitem", { name: "Location" }).click();
  await expect(page.getByRole("dialog", { name: "Share location" })).toBeVisible();
}

test.describe("location sharing", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  test.setTimeout(120_000);
  let alice: TestUser, bob: TestUser, eve: TestUser;
  test.beforeAll(async () => {
    alice = await createUser();
    bob = await createUser();
    eve = await createUser();
    await makeFriends(alice, bob);
  });
  test.afterAll(async () => deleteUsers(alice, bob, eve));

  test("denied permission shares nothing and says why", async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "Geolocation denial is emulated reliably in Chromium only");
    const a = await open(browser, alice, "denied");
    const chat = await chatWith(a, bob);
    await openLocationSheet(a);
    await a.getByRole("button", { name: "Send current location" }).click();
    await expect(a.getByText("Location permission was denied.")).toBeVisible();
    const { count } = await admin().from("messages").select("*", { count: "exact", head: true }).eq("conversation_id", chat).eq("type", "location");
    expect(count).toBe(0);
    await a.context().close();
  });

  test("static location, then live sharing that the recipient sees, stops, and expires", async ({ browser }) => {
    const a = await open(browser, alice, "granted");
    const b = await open(browser, bob, "denied");
    const chat = await chatWith(a, bob);
    await b.goto(`/chats/${chat}`);

    // Static location.
    await openLocationSheet(a);
    await a.getByRole("button", { name: "Send current location" }).click();
    await expect(b.getByRole("link", { name: /Open in maps/ }).first()).toBeVisible({ timeout: 20_000 });
    const href = await b.getByRole("link", { name: /Open in maps/ }).first().getAttribute("href");
    expect(href).toContain("28.6139");

    // Live for 15 minutes; the four durations are offered.
    await openLocationSheet(a);
    for (const label of ["15 min", "1 hour", "8 hours", "Until I stop"]) await expect(a.getByRole("button", { name: label })).toBeVisible();
    await a.getByRole("button", { name: "15 min" }).click();
    await expect(b.getByText("Live location", { exact: true })).toBeVisible({ timeout: 20_000 });
    const { data: share } = await admin().from("location_shares").select("id, expires_at").eq("conversation_id", chat).order("created_at", { ascending: false }).limit(1).single();
    const minutes = (new Date(share!.expires_at).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);

    // Only conversation members can read it.
    const outsider = await open(browser, eve, "denied");
    const session = await sessionFromCookies(outsider.context());
    const rest = await outsider.request.get(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/location_shares?id=eq.${share!.id}&select=latitude`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${session!.access_token}` },
    });
    expect(rest.ok()).toBe(true);
    expect(await rest.json()).toEqual([]);

    // Sender stops; recipient sees it end.
    await a.getByRole("button", { name: "Stop sharing" }).first().click();
    await expect(b.getByText("Live location ended").first()).toBeVisible({ timeout: 40_000 });

    // A second share that expires on its own.
    await openLocationSheet(a);
    await a.getByRole("button", { name: "Until I stop" }).click();
    // Wait for the new share (24 h safety limit) to be created.
    const latest = async () =>
      (await admin().from("location_shares").select("id, expires_at").eq("conversation_id", chat).order("created_at", { ascending: false }).limit(1).single()).data!;
    await expect.poll(async () => (new Date((await latest()).expires_at).getTime() - Date.now()) / 3_600_000, { timeout: 20_000 }).toBeGreaterThan(23.9);
    const until = await latest();
    await admin().from("location_shares").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", until!.id);
    await b.reload();
    await expect(b.getByText("Live location ended").last()).toBeVisible({ timeout: 20_000 });

    await Promise.all([a, b, outsider].map((p) => p.context().close()));
  });
});

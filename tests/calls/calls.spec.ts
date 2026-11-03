import { test, type Browser, type Page } from "@playwright/test";
import { admin, canCreateUsers, createUser, deleteUsers, expect, login, makeFriends, NEEDS_USERS, type TestUser } from "../support/fixtures";

/**
 * Real LiveKit calls between two browsers with Chromium's fake camera and
 * microphone. Needs LIVEKIT_* configured for the server under test.
 */
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

const LIVEKIT = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);

async function caller(browser: Browser, user: TestUser, media: boolean): Promise<Page> {
  const context = await browser.newContext({ permissions: media ? ["camera", "microphone"] : [] });
  const page = await context.newPage();
  await login(page, user);
  return page;
}

async function openChat(page: Page, other: TestUser) {
  const res = await page.request.post("/api/conversations", { data: { type: "direct", userId: other.id } });
  const id = (await res.json()).data.id as string;
  await page.goto(`/chats/${id}`);
  return id;
}

test.describe("calls", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  test.skip(!LIVEKIT, "LiveKit isn't configured");
  test.skip(({ browserName }) => browserName !== "chromium", "Fake camera/microphone flags are Chromium-only");
  test.setTimeout(150_000);
  let alice: TestUser, bob: TestUser;
  test.beforeAll(async () => {
    alice = await createUser();
    bob = await createUser();
    await makeFriends(alice, bob);
  });
  test.afterAll(async () => deleteUsers(alice, bob));

  test("video call: ring, accept, connected with duration, mute/camera/effects, end; history and no secrets in the browser", async ({ browser }) => {
    const a = await caller(browser, alice, true);
    const b = await caller(browser, bob, true);
    const secretSeen: string[] = [];
    a.on("response", async (r) => {
      if (!r.url().includes("/api/calls")) return;
      const text = await r.text().catch(() => "");
      if (process.env.LIVEKIT_API_SECRET && text.includes(process.env.LIVEKIT_API_SECRET)) secretSeen.push(r.url());
    });
    await openChat(a, bob);
    await b.goto("/home");
    await b.waitForLoadState("networkidle").catch(() => undefined);

    await a.getByRole("button", { name: "Video call", exact: true }).first().click();
    await a.waitForURL(/\/calls\/[0-9a-f-]+/);
    const accept = b.getByRole("button", { name: "Accept video call" });
    await expect(accept).toBeVisible({ timeout: 30_000 });
    // The Accept button pulses continuously, so it never counts as "stable".
    await accept.click({ force: true });
    await b.waitForURL(/\/calls\/[0-9a-f-]+/);

    // Connected: the timer runs on both sides.
    await expect(a.getByText(/^\d+:\d{2}$/).first()).toBeVisible({ timeout: 45_000 });
    await expect(b.getByText(/^\d+:\d{2}$/).first()).toBeVisible({ timeout: 45_000 });

    await a.getByRole("button", { name: "Mute microphone" }).click();
    await expect(a.getByRole("button", { name: "Unmute microphone" })).toBeVisible();
    await a.getByRole("button", { name: "Turn camera off" }).click();
    await expect(a.getByRole("button", { name: "Turn camera on" })).toBeVisible();
    await a.getByRole("button", { name: "Turn camera on" }).click();

    // Effects: pick a colour filter during the call, then turn it off.
    await a.getByRole("button", { name: "Video effects" }).first().click();
    await a.getByRole("button", { name: "Warm", exact: true }).click();
    await a.getByRole("button", { name: "None", exact: true }).click();
    await a.getByRole("button", { name: "Close effects" }).click();

    await a.getByRole("button", { name: "Leave call" }).click();
    await expect(b.getByText(/Call ended|You left the call/).first()).toBeVisible({ timeout: 30_000 });

    const { data: calls } = await admin().from("calls").select("status, started_at, ended_at").order("created_at", { ascending: false }).limit(1);
    expect(calls?.[0]?.started_at).toBeTruthy();
    expect(secretSeen).toEqual([]);
    await Promise.all([a, b].map((p) => p.context().close()));
  });

  test("voice call declined by the callee", async ({ browser }) => {
    const a = await caller(browser, alice, true);
    const b = await caller(browser, bob, true);
    await openChat(a, bob);
    await b.goto("/home");
    await a.getByRole("button", { name: "Voice call", exact: true }).first().click();
    await a.waitForURL(/\/calls\//);
    await b.getByRole("button", { name: "Decline call" }).first().click();
    await expect(a.getByText("Call declined").first()).toBeVisible({ timeout: 30_000 });
    await Promise.all([a, b].map((p) => p.context().close()));
  });
});

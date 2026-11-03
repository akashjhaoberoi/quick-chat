import { test, type Browser, type Page } from "@playwright/test";
import { canCreateUsers, createUser, deleteUsers, expect, login, makeFriends, NEEDS_USERS, type TestUser } from "../support/fixtures";

/** Calling when the browser has no camera/microphone permission (no fake-UI flag, so prompts aren't auto-accepted). */
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream"] } });

const LIVEKIT = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);

async function caller(browser: Browser, user: TestUser): Promise<Page> {
  const page = await (await browser.newContext({ permissions: [] })).newPage();
  await login(page, user);
  return page;
}

async function openChat(page: Page, other: TestUser) {
  const res = await page.request.post("/api/conversations", { data: { type: "direct", userId: other.id } });
  await page.goto(`/chats/${(await res.json()).data.id}`);
}

test.describe("calls without media permission", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  test.skip(!LIVEKIT, "LiveKit isn't configured");
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium-only");
  test.setTimeout(120_000);
  let alice: TestUser, bob: TestUser;
  test.beforeAll(async () => {
    alice = await createUser();
    bob = await createUser();
    await makeFriends(alice, bob);
  });
  test.afterAll(async () => deleteUsers(alice, bob));

  test("denied microphone permission explains itself", async ({ browser }) => {
    const a = await caller(browser, alice);
    await openChat(a, bob);
    await a.getByRole("button", { name: "Voice call", exact: true }).first().click();
    await a.waitForURL(/\/calls\//);
    await expect(a.getByText(/microphone|permission/i).first()).toBeVisible({ timeout: 30_000 });
    await a.context().close();
  });
});

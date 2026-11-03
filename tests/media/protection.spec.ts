import { test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { admin, canCreateUsers, createUser, deleteUsers, expect, login, makeFriends, NEEDS_USERS, type TestUser } from "../support/fixtures";

/**
 * Media protection end to end: server-side authorization of profile, cover and
 * chat media, signed-URL lifetimes, view once, protected media, the secure
 * viewer's browser-side measures, and the settings page.
 */

// A real 8×8 PNG (the server checks file signatures).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AATAxEcQAz0QEHOoQ+uAAAAABJRU5ErkJggg==",
  "base64",
);

async function upload(request: APIRequestContext, purpose: "avatar" | "cover" | "message"): Promise<string> {
  const res = await request.post("/api/media/upload-url", { data: { purpose, mime: "image/png", size: PNG.length, width: 8, height: 8 } });
  expect(res.ok(), await res.text()).toBe(true);
  const { data } = await res.json();
  const put = await request.put(data.upload.url, { data: PNG, headers: data.upload.headers });
  expect(put.ok(), `upload PUT ${put.status()}`).toBe(true);
  const done = await request.post(`/api/media/${data.id}/complete`);
  expect(done.ok(), await done.text()).toBe(true);
  return data.id as string;
}

/** Status, cache header and signed-URL lifetime (seconds) of a media request. */
async function fetchMedia(request: APIRequestContext, id: string, query = "") {
  const res = await request.get(`/api/media/${id}${query}`, { maxRedirects: 0 });
  const location = res.headers()["location"] ?? "";
  let lifetime: number | null = null;
  const token = location ? new URL(location).searchParams.get("token") : null;
  if (token) {
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    lifetime = claims.exp - claims.iat;
  }
  return { status: res.status(), cache: res.headers()["cache-control"] ?? "", lifetime };
}

async function signedIn(browser: Browser, user: TestUser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await login(page, user);
  return page;
}

async function directChat(page: Page, other: TestUser): Promise<string> {
  const res = await page.request.post("/api/conversations", { data: { type: "direct", userId: other.id } });
  expect(res.ok()).toBe(true);
  return (await res.json()).data.id;
}

async function sendImage(page: Page, conversationId: string, mediaMode: string) {
  const media = await upload(page.request, "message");
  const res = await page.request.post("/api/messages", { data: { conversationId, type: "image", mediaIds: [media], mediaMode } });
  expect(res.ok(), await res.text()).toBe(true);
  return { media, message: (await res.json()).data as { id: string; media_mode: string } };
}

test.describe("media protection", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  // Each test signs in up to three people and uploads real files.
  test.setTimeout(120_000);
  let alice: TestUser, bob: TestUser, eve: TestUser;
  test.beforeAll(async () => {
    alice = await createUser();
    bob = await createUser();
    eve = await createUser();
    await makeFriends(alice, bob);
  });
  test.afterAll(async () => deleteUsers(alice, bob, eve));

  test("media is never served to signed-out visitors", async ({ request }) => {
    const res = await request.get("/api/media/0b4e2b9c-0000-4000-8000-000000000000", { maxRedirects: 0 });
    expect(res.status()).toBe(401);
  });

  test("profile and cover photos follow the owner's visibility, with short-lived links", async ({ browser }) => {
    const a = await signedIn(browser, alice);
    const b = await signedIn(browser, bob);
    const e = await signedIn(browser, eve);
    const avatar = await upload(a.request, "avatar");
    const cover = await upload(a.request, "cover");
    const patch = await a.request.patch("/api/profiles/me", { data: { avatarMediaId: avatar, coverMediaId: cover } });
    expect(patch.ok(), await patch.text()).toBe(true);

    // Everyone (default): any signed-in user, 5-minute link, privately cached.
    const open = await fetchMedia(e.request, avatar);
    expect(open.status).toBe(302);
    expect(open.lifetime).toBeLessThanOrEqual(300);
    expect(open.cache).toContain("private");

    // Friends only: the stranger is refused, the friend isn't.
    await admin().from("user_settings").update({ avatar_visibility: "friends", cover_visibility: "friends" }).eq("user_id", alice.id);
    expect((await fetchMedia(e.request, avatar)).status).toBe(404);
    expect((await fetchMedia(e.request, cover)).status).toBe(404);
    expect((await fetchMedia(b.request, avatar)).status).toBe(302);

    // The profile page hides the photo ids from the stranger and falls back to initials.
    await e.goto(`/profile/${alice.username}`);
    await expect(e.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(e.getByRole("button", { name: "View profile photo" })).toHaveCount(0);
    await expect(e.getByRole("button", { name: "View cover photo" })).toHaveCount(0);

    // Only me: even the friend is refused; the owner still sees them.
    await admin().from("user_settings").update({ avatar_visibility: "nobody", cover_visibility: "nobody" }).eq("user_id", alice.id);
    expect((await fetchMedia(b.request, avatar)).status).toBe(404);
    expect((await fetchMedia(a.request, avatar)).status).toBe(302);
    await admin().from("user_settings").update({ avatar_visibility: "everyone", cover_visibility: "everyone" }).eq("user_id", alice.id);

    // Viewers get the protected viewer with their own watermark; no save gestures.
    await b.goto(`/profile/${alice.username}`);
    const coverImg = b.locator("[data-protected-media] img").first();
    await expect(coverImg).toBeVisible();
    expect(await coverImg.evaluate((img: HTMLImageElement) => img.draggable)).toBe(false);
    const contextMenuAllowed = await b.locator("[data-protected-media]").first().evaluate((el) =>
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
    );
    expect(contextMenuAllowed).toBe(false);
    await expect(b.getByTestId("watermark").first()).toContainText(`@${bob.username}`);
    await b.getByRole("button", { name: "View profile photo" }).click();
    const viewer = b.getByTestId("secure-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.getByTestId("watermark")).toContainText(`@${bob.username}`);
    await expect(viewer.getByRole("link", { name: "Download" })).toHaveCount(0);

    await Promise.all([a, b, e].map((p) => p.context().close()));
  });

  test("protected chat media: no download, 60-second uncached links, hidden in the background, screenshot report", async ({ browser }) => {
    const a = await signedIn(browser, alice);
    const b = await signedIn(browser, bob);
    const e = await signedIn(browser, eve);
    const chat = await directChat(a, bob);
    const { media, message } = await sendImage(a, chat, "protected");
    expect(message.media_mode).toBe("protected");

    const view = await fetchMedia(b.request, media);
    expect(view.status).toBe(302);
    expect(view.cache).toBe("no-store");
    expect(view.lifetime).toBeLessThanOrEqual(60);
    expect((await fetchMedia(b.request, media, "?download=1")).status).toBe(403);
    expect((await fetchMedia(e.request, media)).status).toBe(404);
    const { count } = await admin().from("media_access_log").select("*", { count: "exact", head: true }).eq("media_id", media).eq("viewer_id", bob.id);
    expect(count).toBeGreaterThan(0);

    const fwd = await b.request.post(`/api/messages/${message.id}/forward`, { data: { conversationIds: [chat] } });
    expect(fwd.status()).toBe(403);

    await b.goto(`/chats/${chat}`);
    const thumb = b.getByRole("button", { name: "Open photo 1" }).last();
    await expect(thumb).toBeVisible();
    await expect(b.getByText("Protected", { exact: true }).last()).toBeVisible();
    await thumb.click();
    const viewer = b.getByTestId("secure-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.getByTestId("watermark")).toContainText(`@${bob.username}`);
    await expect(viewer.getByRole("link", { name: "Download" })).toHaveCount(0);

    // Window loses focus (another app, Snipping Tool) → media hidden; focus → back.
    await b.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(viewer.getByTestId("privacy-shield")).toBeVisible();
    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(viewer.getByTestId("privacy-shield")).toHaveCount(0);

    // PrintScreen reaches the page on Windows: the sender is notified.
    await b.keyboard.press("PrintScreen");
    await expect(b.getByText("Screenshot detected — the sender was notified.")).toBeVisible();
    await expect
      .poll(async () => (await admin().from("notifications").select("id").eq("user_id", alice.id).eq("entity_id", message.id)).data?.length)
      .toBe(1);

    await Promise.all([a, b, e].map((p) => p.context().close()));
  });

  test("view once: nothing before opening, one window, gone after leaving", async ({ browser }) => {
    const a = await signedIn(browser, alice);
    const b = await signedIn(browser, bob);
    const chat = await directChat(a, bob);
    const { media, message } = await sendImage(a, chat, "view_once");
    expect((await fetchMedia(b.request, media)).status).toBe(404);

    await b.goto(`/chats/${chat}`);
    const bubble = b.getByTestId("view-once").last();
    await expect(bubble).toContainText("Tap to view");
    await bubble.click();
    await b.getByRole("button", { name: "Open", exact: true }).click();
    const viewer = b.getByTestId("secure-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.getByTestId("view-countdown")).toBeVisible();
    await expect(viewer.getByTestId("watermark")).toContainText(`@${bob.username}`);
    const during = await fetchMedia(b.request, media);
    expect(during.status).toBe(302);
    expect(during.cache).toBe("no-store");
    expect(during.lifetime).toBeLessThanOrEqual(60);

    // Leaving Quick Chat (tab hidden) closes it, and the view is spent.
    await b.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(viewer).toHaveCount(0);
    await expect(bubble).toContainText("Opened");
    await expect(bubble).toBeDisabled();
    await expect.poll(async () => (await fetchMedia(b.request, media)).status).toBe(404);
    const again = await b.request.post(`/api/messages/${message.id}/view-once`);
    expect(again.status()).toBe(403);

    // The sender sees it was opened.
    const seen = await a.request.get(`/api/messages/${message.id}`);
    expect((await seen.json()).data.view_once.opened_count).toBe(1);

    await Promise.all([a, b].map((p) => p.context().close()));
  });

  test("the composer sends view-once photos and the settings page saves to the server", async ({ browser }) => {
    const a = await signedIn(browser, alice);
    const chat = await directChat(a, bob);
    await a.goto(`/chats/${chat}`);
    await a.locator('input[type="file"][accept^="image/jpeg"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
    await a.getByRole("radio", { name: "View once" }).click();
    await a.getByRole("button", { name: "Send", exact: true }).click();
    await expect(a.getByTestId("view-once").last()).toContainText("Not opened yet", { timeout: 30_000 });
    const { data: rows } = await admin().from("messages").select("media_mode").eq("conversation_id", chat).eq("sender_id", alice.id).order("created_at", { ascending: false }).limit(1);
    expect(rows?.[0]?.media_mode).toBe("view_once");

    await a.goto("/settings/media");
    await a.getByRole("group", { name: "Who can see my profile photo" }).getByText("Only me", { exact: true }).click();
    await expect
      .poll(async () => (await admin().from("user_settings").select("avatar_visibility").eq("user_id", alice.id).single()).data?.avatar_visibility)
      .toBe("nobody");
    await admin().from("user_settings").update({ avatar_visibility: "everyone" }).eq("user_id", alice.id);
    await a.context().close();
  });
});

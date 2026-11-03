import { test } from "@playwright/test";
import { admin, canCreateUsers, createUser, deleteUsers, expect, login, makeFriends, NEEDS_USERS, trackErrors, type TestUser } from "../support/fixtures";

test.describe("direct messages", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  let alice: TestUser;
  let bob: TestUser;
  test.beforeAll(async () => {
    alice = await createUser();
    bob = await createUser();
    await makeFriends(alice, bob);
  });
  test.afterAll(async () => deleteUsers(alice, bob));

  test("a message sent by one friend appears live for the other", async ({ browser }) => {
    const ca = await browser.newContext();
    const cb = await browser.newContext();
    const a = await ca.newPage();
    const b = await cb.newPage();
    const errors = [...trackErrors(a)];
    await login(a, alice);
    await login(b, bob);

    const res = await a.request.post("/api/conversations", { data: { type: "direct", userId: bob.id } });
    expect(res.ok()).toBe(true);
    const { data } = await res.json();
    await a.goto(`/chats/${data.id}`);
    await b.goto(`/chats/${data.id}`);

    const text = `hello from e2e ${Date.now()}`;
    await a.getByLabel("Message", { exact: true }).fill(text);
    await a.getByRole("button", { name: "Send", exact: true }).click();
    const bubble = (p: typeof a) => p.getByRole("button", { name: /^Message from/ }).filter({ hasText: text });
    await expect(bubble(a)).toBeVisible();
    // Delivered over Supabase Realtime, without reloading Bob's page.
    await expect(bubble(b)).toBeVisible({ timeout: 20_000 });

    // Persisted: still there after a reload.
    await b.reload();
    await expect(bubble(b)).toBeVisible();
    expect(errors).toEqual([]);
    await ca.close();
    await cb.close();
  });

  test("strangers cannot read the conversation", async ({ browser }) => {
    const eve = await createUser();
    const c = await browser.newContext();
    const p = await c.newPage();
    try {
      const ca = await browser.newContext();
      const a = await ca.newPage();
      await login(a, alice);
      const { data } = await (await a.request.post("/api/conversations", { data: { type: "direct", userId: bob.id } })).json();
      await ca.close();
      const { error } = await admin().from("messages").insert({ conversation_id: data.id, sender_id: alice.id, type: "text", body: "private" });
      expect(error).toBeNull();
      await login(p, eve);
      // Row-level security hides every message: either an error status or an empty page.
      const res = await p.request.get(`/api/conversations/${data.id}/messages`);
      const body = res.ok() ? await res.json() : null;
      expect(body === null || body.data.messages.length === 0, JSON.stringify(body)).toBe(true);
      const { data: direct } = await (await p.request.get(`/api/conversations/${data.id}`)).json().catch(() => ({ data: null }));
      expect(direct?.id).toBeUndefined();
    } finally {
      await c.close();
      await deleteUsers(eve);
    }
  });
});

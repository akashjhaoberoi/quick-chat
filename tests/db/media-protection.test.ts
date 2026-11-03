import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

let t: TestDb;
let alice: string, bob: string, carol: string, eve: string, mod: string;
let direct: string;
let avatar: string, cover: string;

type Msg = { id: string; media_mode: string; expires_at: string | null };

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice");
  bob = await t.createUser("bob");
  carol = await t.createUser("carol");
  eve = await t.createUser("eve");
  mod = await t.createUser("mod");
  await t.makeFriends(alice, bob);
  await t.makeFriends(alice, carol);
  await t.admin(`insert into public.admin_roles (user_id, role) values ($1, 'moderator')`, [mod]);
  avatar = await t.createMedia(alice, "avatar");
  cover = await t.createMedia(alice, "cover");
  await t.admin(`update public.profiles set avatar_media_id = $2, cover_media_id = $3 where id = $1`, [alice, avatar, cover]);
  const [d] = await t.as(alice).rpc<{ get_or_create_direct_conversation: string }>("get_or_create_direct_conversation", { p_other: bob });
  direct = d.get_or_create_direct_conversation;
});
afterAll(async () => t?.close());

async function canAccess(user: string | null, media: string) {
  if (!user) return (await t.as(null).rpc<{ can_access_media: boolean }>("can_access_media", { p_media_id: media }))[0].can_access_media;
  const [row] = await t.as(user).rpc<{ can_access_media: boolean }>("can_access_media", { p_media_id: media });
  return row.can_access_media;
}

async function setVisibility(avatarVis: string, coverVis: string) {
  await t.as(alice).query(`update public.user_settings set avatar_visibility = $2, cover_visibility = $3 where user_id = $1`, [alice, avatarVis, coverVis]);
}

async function summary(viewer: string) {
  const [row] = await t.as(viewer).rpc<{ avatar_media_id: string | null; cover_media_id: string | null; media_watermark: boolean }>("profile_summary", {
    p_username: "alice",
  });
  return row;
}

async function sendMedia(mode: string, type = "image", from = alice, conversation = direct) {
  const media = await t.createMedia(from, "message", type === "video" ? "video" : "image", type === "video" ? 45_000 : null);
  const [msg] = await t.as(from).rpc<Msg>("send_message", {
    p_conversation_id: conversation, p_type: type, p_media_ids: [media], p_media_mode: mode,
  });
  return { msg, media };
}

describe("profile and cover photo visibility", () => {
  it("defaults to everyone (signed in, not blocked) and is never public to anonymous visitors", async () => {
    expect(await canAccess(eve, avatar)).toBe(true);
    expect(await canAccess(eve, cover)).toBe(true);
    await expectDbError(canAccess(null, avatar), "permission denied");
  });

  it("friends-only hides both photos from non-friends, in media access and in the profile", async () => {
    await setVisibility("friends", "friends");
    expect(await canAccess(bob, avatar)).toBe(true);
    expect(await canAccess(bob, cover)).toBe(true);
    expect(await canAccess(eve, avatar)).toBe(false);
    expect(await canAccess(eve, cover)).toBe(false);
    const s = await summary(eve);
    expect(s.avatar_media_id).toBeNull();
    expect(s.cover_media_id).toBeNull();
    expect((await summary(bob)).avatar_media_id).toBe(avatar);
  });

  it("only me hides the photos from friends too, but not from the owner or moderators", async () => {
    await setVisibility("nobody", "nobody");
    expect(await canAccess(bob, avatar)).toBe(false);
    expect(await canAccess(bob, cover)).toBe(false);
    expect(await canAccess(alice, avatar)).toBe(true);
    expect(await canAccess(mod, cover)).toBe(true);
    expect((await summary(alice)).avatar_media_id).toBe(avatar);
  });

  it("a private account's cover stays friends-only even when set to everyone", async () => {
    await setVisibility("everyone", "everyone");
    await t.admin(`update public.profiles set is_private = true where id = $1`, [alice]);
    expect(await canAccess(eve, cover)).toBe(false);
    expect(await canAccess(eve, avatar)).toBe(true);
    expect(await canAccess(bob, cover)).toBe(true);
    await t.admin(`update public.profiles set is_private = false where id = $1`, [alice]);
  });

  it("blocking removes access to the photos", async () => {
    await t.admin(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [alice, eve]);
    expect(await canAccess(eve, avatar)).toBe(false);
    await t.admin(`delete from public.blocks where blocker_id = $1 and blocked_id = $2`, [alice, eve]);
  });

  it("exposes the owner's watermark preference, which users can change but not for others", async () => {
    expect((await summary(eve)).media_watermark).toBe(true);
    await t.as(alice).query(`update public.user_settings set media_watermark = false where user_id = $1`, [alice]);
    expect((await summary(eve)).media_watermark).toBe(false);
    await t.as(eve).query(`update public.user_settings set media_watermark = true, avatar_visibility = 'everyone' where user_id = $1`, [alice]);
    const [row] = await t.admin<{ media_watermark: boolean }>(`select media_watermark from public.user_settings where user_id = $1`, [alice]);
    expect(row.media_watermark).toBe(false);
  });
});

describe("chat media modes", () => {
  it("rejects modes on non-media messages and multi-file view-once", async () => {
    await expectDbError(
      t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "text", p_body: "hi", p_media_mode: "protected" }),
      "invalid_media_mode",
    );
    await expectDbError(
      t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "image", p_media_ids: [await t.createMedia(alice, "message")], p_media_mode: "bogus" }),
      "invalid_media_mode",
    );
    const two = [await t.createMedia(alice, "message"), await t.createMedia(alice, "message")];
    await expectDbError(
      t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "image", p_media_ids: two, p_media_mode: "view_once" }),
      "view_once_single_media",
    );
  });

  it("view once: no access before opening, one view window, then denied for good", async () => {
    const { msg, media } = await sendMedia("view_once");
    expect(msg.media_mode).toBe("view_once");
    expect(await canAccess(bob, media)).toBe(false);
    expect(await canAccess(alice, media)).toBe(true);
    expect(await canAccess(eve, media)).toBe(false);

    const [opened] = await t.as(bob).rpc<{ open_message_media: string }>("open_message_media", { p_message_id: msg.id });
    const windowMs = new Date(opened.open_message_media).getTime() - Date.now();
    expect(windowMs).toBeGreaterThan(50_000);
    expect(windowMs).toBeLessThanOrEqual(61_000);
    expect(await canAccess(bob, media)).toBe(true);
    // Re-opening inside the window (e.g. a reload) returns the same window.
    const [again] = await t.as(bob).rpc<{ open_message_media: string }>("open_message_media", { p_message_id: msg.id });
    expect(new Date(again.open_message_media).getTime()).toBe(new Date(opened.open_message_media).getTime());

    await t.as(bob).rpc("close_message_media", { p_message_id: msg.id });
    expect(await canAccess(bob, media)).toBe(false);
    await expectDbError(t.as(bob).rpc("open_message_media", { p_message_id: msg.id }), "already_viewed");

    // The sender sees that it was opened; outsiders see nothing.
    expect(await t.as(alice).query(`select 1 from public.message_media_views where message_id = $1`, [msg.id])).toHaveLength(1);
    expect(await t.as(eve).query(`select 1 from public.message_media_views where message_id = $1`, [msg.id])).toHaveLength(0);
  });

  it("view once: videos get their length plus 30 seconds; senders and outsiders can't open", async () => {
    const { msg } = await sendMedia("view_once", "video");
    await expectDbError(t.as(alice).rpc("open_message_media", { p_message_id: msg.id }), "own_view_once");
    await expectDbError(t.as(eve).rpc("open_message_media", { p_message_id: msg.id }), "message_not_found");
    const [opened] = await t.as(bob).rpc<{ open_message_media: string }>("open_message_media", { p_message_id: msg.id });
    const secs = (new Date(opened.open_message_media).getTime() - Date.now()) / 1000;
    expect(secs).toBeGreaterThan(70);
    expect(secs).toBeLessThanOrEqual(76);
  });

  it("users cannot write view records directly", async () => {
    const { msg } = await sendMedia("view_once");
    await expectDbError(
      t.as(bob).query(`insert into public.message_media_views (message_id, viewer_id, view_expires_at) values ($1, $2, now() + interval '1 day')`, [msg.id, bob]),
      "permission denied",
    );
  });

  it("protected media stays viewable by members but can't be forwarded; view once can't either", async () => {
    const { msg, media } = await sendMedia("protected");
    expect(await canAccess(bob, media)).toBe(true);
    expect(await canAccess(eve, media)).toBe(false);
    const [g] = await t.as(alice).rpc<{ get_or_create_direct_conversation: string }>("get_or_create_direct_conversation", { p_other: carol });
    await expectDbError(t.as(bob).rpc("forward_message", { p_message_id: msg.id, p_conversation_ids: [direct] }), "cannot_forward_protected");
    const once = await sendMedia("view_once");
    await expectDbError(t.as(alice).rpc("forward_message", { p_message_id: once.msg.id, p_conversation_ids: [g.get_or_create_direct_conversation] }), "cannot_forward_protected");
    const normal = await sendMedia("normal");
    const [fwd] = await t.as(alice).rpc<{ forward_message: number }>("forward_message", { p_message_id: normal.msg.id, p_conversation_ids: [g.get_or_create_direct_conversation] });
    expect(fwd.forward_message).toBe(1);
  });

  it("disappearing media expires within 24 hours", async () => {
    const { msg } = await sendMedia("disappearing");
    const hours = (new Date(msg.expires_at!).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it("deleting the message revokes access to its media", async () => {
    const { msg, media } = await sendMedia("protected");
    expect(await canAccess(bob, media)).toBe(true);
    await t.as(alice).rpc("delete_message", { p_message_id: msg.id, p_for_everyone: true });
    expect(await canAccess(bob, media)).toBe(false);
  });
});

describe("screenshot reports", () => {
  it("notifies the sender once per minute for protected or view-once media only", async () => {
    const { msg } = await sendMedia("protected");
    const [first] = await t.as(bob).rpc<{ report_media_screenshot: boolean }>("report_media_screenshot", { p_message_id: msg.id });
    const [second] = await t.as(bob).rpc<{ report_media_screenshot: boolean }>("report_media_screenshot", { p_message_id: msg.id });
    expect(first.report_media_screenshot).toBe(true);
    expect(second.report_media_screenshot).toBe(false);
    const notes = await t.as(alice).query<{ body: string }>(`select body from public.notifications where type = 'snap_screenshot' and entity_id = $1`, [msg.id]);
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain("protected photo");
    const events = await t.as(alice).query(`select 1 from public.media_security_events where target_id = $1`, [msg.id]);
    expect(events).toHaveLength(1);

    const normal = await sendMedia("normal");
    await expectDbError(t.as(bob).rpc("report_media_screenshot", { p_message_id: normal.msg.id }), "message_not_found");
    await expectDbError(t.as(eve).rpc("report_media_screenshot", { p_message_id: msg.id }), "message_not_found");
  });

  it("respects the recipient's screenshot-alert preference", async () => {
    await t.as(alice).query(`update public.user_settings set notification_prefs = '{"snap_screenshot": false}' where user_id = $1`, [alice]);
    const { msg } = await sendMedia("protected");
    await t.as(bob).rpc("report_media_screenshot", { p_message_id: msg.id });
    expect(await t.as(alice).query(`select 1 from public.notifications where entity_id = $1`, [msg.id])).toHaveLength(0);
    await t.as(alice).query(`update public.user_settings set notification_prefs = '{}' where user_id = $1`, [alice]);
  });
});

describe("maintenance and privileges", () => {
  it("deletes view-once media once every recipient's window closed, and after 14 days unopened", async () => {
    const opened = await sendMedia("view_once");
    await t.as(bob).rpc("open_message_media", { p_message_id: opened.msg.id });
    await t.as(bob).rpc("close_message_media", { p_message_id: opened.msg.id });
    const unopened = await sendMedia("view_once");
    const old = await sendMedia("view_once");
    await t.admin(`update public.conversation_members set joined_at = now() - interval '20 days' where conversation_id = $1`, [direct]);
    await t.admin(`update public.messages set created_at = now() - interval '15 days' where id = $1`, [old.msg.id]);

    const [res] = await t.admin<{ run_media_maintenance: { view_once_media: number } }>(`select public.run_media_maintenance()`);
    expect(res.run_media_maintenance.view_once_media).toBeGreaterThanOrEqual(2);
    const status = async (id: string) => (await t.admin<{ status: string }>(`select status from public.media_assets where id = $1`, [id]))[0].status;
    expect(await status(opened.media)).toBe("pending_delete");
    expect(await status(old.media)).toBe("pending_delete");
    expect(await status(unopened.media)).toBe("ready");
    await expectDbError(t.as(bob).rpc("open_message_media", { p_message_id: old.msg.id }), "media_expired");
  });

  it("keeps the access log private and the new functions away from anonymous visitors", async () => {
    await t.admin(`insert into public.media_access_log (media_id, viewer_id, purpose, mode) values ($1, $2, 'message', 'protected')`, [avatar, bob]);
    await expectDbError(t.as(bob).query(`select * from public.media_access_log`), "permission denied");
    await expectDbError(t.as(alice).rpc("run_media_maintenance"), "permission denied");
    for (const fn of ["open_message_media", "close_message_media", "report_media_screenshot"]) {
      await expectDbError(t.as(null).rpc(fn, { p_message_id: avatar }), "permission denied");
    }
    await expectDbError(t.as(null).rpc("profile_summary", { p_username: "alice" }), "permission denied");
  });
});

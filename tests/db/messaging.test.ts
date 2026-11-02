import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

let t: TestDb;
let alice: string, bob: string, carol: string, eve: string;
let direct: string;
let group: string;

type Msg = { id: string; body: string | null; type: string; deleted_at: string | null; created_at: string };

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice");
  bob = await t.createUser("bob");
  carol = await t.createUser("carol");
  eve = await t.createUser("eve");
  await t.makeFriends(alice, bob);
  await t.makeFriends(alice, carol);
});
afterAll(async () => t?.close());

describe("direct conversations", () => {
  it("creates exactly one conversation per pair", async () => {
    const [a] = await t.as(alice).rpc<{ get_or_create_direct_conversation: string }>("get_or_create_direct_conversation", { p_other: bob });
    const [b] = await t.as(bob).rpc<{ get_or_create_direct_conversation: string }>("get_or_create_direct_conversation", { p_other: alice });
    expect(a.get_or_create_direct_conversation).toBe(b.get_or_create_direct_conversation);
    direct = a.get_or_create_direct_conversation;
  });

  it("refuses non-friends when who_can_message = friends", async () => {
    await expectDbError(t.as(eve).rpc("get_or_create_direct_conversation", { p_other: alice }), "cannot_message_user");
  });

  it("sends messages, is idempotent on client_id, and notifies the recipient", async () => {
    const [m1] = await t.as(alice).rpc<Msg>("send_message", { p_conversation_id: direct, p_type: "text", p_body: "hello bob", p_client_id: "c1" });
    const [m2] = await t.as(alice).rpc<Msg>("send_message", { p_conversation_id: direct, p_type: "text", p_body: "hello bob", p_client_id: "c1" });
    expect(m1.id).toBe(m2.id);
    const seen = await t.as(bob).query<Msg>(`select * from public.messages where conversation_id = $1`, [direct]);
    expect(seen.map((m) => m.body)).toEqual(["hello bob"]);
    const [note] = await t.as(bob).query<{ type: string; count: number }>(`select type, count from public.notifications where type = 'message'`);
    expect(note.type).toBe("message");
  });

  it("dedupes chat notifications per conversation and re-arms after read", async () => {
    await t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "text", p_body: "second" });
    const rows = await t.as(bob).query<{ count: number; body: string }>(`select count, body from public.notifications where type = 'message'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
    expect(rows[0].body).toBe("second");
  });

  it("outsiders cannot read the conversation or its messages", async () => {
    expect(await t.as(eve).query(`select * from public.messages where conversation_id = $1`, [direct])).toHaveLength(0);
    expect(await t.as(eve).query(`select * from public.conversations where id = $1`, [direct])).toHaveLength(0);
    expect(await t.as(eve).query(`select * from public.conversation_members where conversation_id = $1`, [direct])).toHaveLength(0);
    await expectDbError(t.as(eve).rpc("send_message", { p_conversation_id: direct, p_type: "text", p_body: "intrude" }), "conversation_not_found");
  });

  it("users cannot insert messages directly, bypassing the RPC", async () => {
    await expectDbError(
      t.as(alice).query(`insert into public.messages (conversation_id, sender_id, type, body) values ($1, auth.uid(), 'text', 'x')`, [direct]),
      "permission denied",
    );
  });

  it("lists conversations with unread counts and clears them on read", async () => {
    const [row] = await t.as(bob).rpc<{ unread_count: number; title: string }>("my_conversations");
    expect(Number(row.unread_count)).toBe(2);
    expect(row.title).toBe("alice");
    await t.as(bob).rpc("mark_conversation_read", { p_conversation_id: direct });
    const [after] = await t.as(bob).rpc<{ unread_count: number }>("my_conversations");
    expect(Number(after.unread_count)).toBe(0);
    const unread = await t.as(bob).query(`select 1 from public.notifications where read_at is null and type = 'message'`);
    expect(unread).toHaveLength(0);
  });

  it("keeps read position private when read receipts are disabled", async () => {
    await t.as(bob).query(`update public.user_settings set read_receipts = false where user_id = auth.uid()`);
    await t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "text", p_body: "are you there" });
    const [before] = await t.as(alice).query<{ last_read_public_at: string }>(
      `select last_read_public_at from public.conversation_members where conversation_id = $1 and user_id = $2`, [direct, bob]);
    await t.as(bob).rpc("mark_conversation_read", { p_conversation_id: direct });
    const [after] = await t.as(alice).query<{ last_read_public_at: string }>(
      `select last_read_public_at from public.conversation_members where conversation_id = $1 and user_id = $2`, [direct, bob]);
    expect(after.last_read_public_at).toEqual(before.last_read_public_at);
    // and alice can never see bob's private state row
    expect(await t.as(alice).query(`select * from public.conversation_member_state where user_id = $1`, [bob])).toHaveLength(0);
    await t.as(bob).query(`update public.user_settings set read_receipts = true where user_id = auth.uid()`);
  });

  it("edits only own recent text messages", async () => {
    const [m] = await t.as(alice).rpc<Msg>("send_message", { p_conversation_id: direct, p_type: "text", p_body: "typo" });
    const [edited] = await t.as(alice).rpc<Msg & { edited_at: string }>("edit_message", { p_message_id: m.id, p_body: "fixed" });
    expect(edited.body).toBe("fixed");
    expect(edited.edited_at).not.toBeNull();
    await expectDbError(t.as(bob).rpc("edit_message", { p_message_id: m.id, p_body: "hacked" }), "cannot_edit_message");
    await t.admin(`update public.messages set created_at = now() - interval '1 hour' where id = $1`, [m.id]);
    await expectDbError(t.as(alice).rpc("edit_message", { p_message_id: m.id, p_body: "late" }), "cannot_edit_message");
  });

  it("deletes for me and for everyone", async () => {
    const [m] = await t.as(alice).rpc<Msg>("send_message", { p_conversation_id: direct, p_type: "text", p_body: "secret" });
    await t.as(bob).rpc("delete_message", { p_message_id: m.id, p_for_everyone: false });
    expect(await t.as(bob).query(`select 1 from public.messages where id = $1`, [m.id])).toHaveLength(0);
    expect(await t.as(alice).query(`select 1 from public.messages where id = $1`, [m.id])).toHaveLength(1);

    await expectDbError(t.as(bob).rpc("delete_message", { p_message_id: m.id, p_for_everyone: true }), "message_not_found");
    await t.as(alice).rpc("delete_message", { p_message_id: m.id, p_for_everyone: true });
    const [gone] = await t.as(alice).query<Msg>(`select * from public.messages where id = $1`, [m.id]);
    expect(gone.body).toBeNull();
    expect(gone.deleted_at).not.toBeNull();
  });

  it("reacts, replaces and removes reactions", async () => {
    const [m] = await t.as(alice).rpc<Msg>("send_message", { p_conversation_id: direct, p_type: "text", p_body: "react to me" });
    await t.as(bob).rpc("react_to_message", { p_message_id: m.id, p_emoji: "🔥" });
    await t.as(bob).rpc("react_to_message", { p_message_id: m.id, p_emoji: "😂" });
    let rows = await t.as(alice).query<{ emoji: string }>(`select emoji from public.message_reactions where message_id = $1`, [m.id]);
    expect(rows.map((r) => r.emoji)).toEqual(["😂"]);
    await t.as(bob).rpc("react_to_message", { p_message_id: m.id, p_emoji: "😂" });
    rows = await t.as(alice).query(`select emoji from public.message_reactions where message_id = $1`, [m.id]);
    expect(rows).toHaveLength(0);
    await expectDbError(t.as(eve).rpc("react_to_message", { p_message_id: m.id, p_emoji: "👍" }), "message_not_found");
  });

  it("pins, stars and replies", async () => {
    const [m] = await t.as(alice).rpc<Msg>("send_message", { p_conversation_id: direct, p_type: "text", p_body: "pin me" });
    await t.as(bob).rpc("set_message_pinned", { p_message_id: m.id, p_pinned: true });
    await t.as(bob).rpc("set_message_starred", { p_message_id: m.id, p_starred: true });
    expect(await t.as(bob).query(`select 1 from public.starred_messages`)).toHaveLength(1);
    expect(await t.as(alice).query(`select 1 from public.starred_messages`)).toHaveLength(0);
    const [reply] = await t.as(bob).rpc<{ reply_to_id: string }>("send_message", {
      p_conversation_id: direct, p_type: "text", p_body: "replying", p_reply_to: m.id,
    });
    expect(reply.reply_to_id).toBe(m.id);
  });

  it("validates message payloads", async () => {
    await expectDbError(t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "text", p_body: "  " }), "empty_message");
    await expectDbError(t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "image" }), "media_required");
    await expectDbError(t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "system", p_body: "x" }), "invalid_message_type");
    await expectDbError(
      t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "location", p_metadata: JSON.stringify({ lat: 200, lng: 0 }) }),
      "invalid_location",
    );
    const foreign = await t.createMedia(bob, "message");
    await expectDbError(
      t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "image", p_media_ids: [foreign] }),
      "invalid_media",
    );
  });

  it("attachments are visible only to members and gate media access", async () => {
    const media = await t.createMedia(alice, "message");
    await t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "image", p_media_ids: [media] });
    const [bobAccess] = await t.as(bob).rpc<{ can_access_media: boolean }>("can_access_media", { p_media_id: media });
    expect(bobAccess.can_access_media).toBe(true);
    const [eveAccess] = await t.as(eve).rpc<{ can_access_media: boolean }>("can_access_media", { p_media_id: media });
    expect(eveAccess.can_access_media).toBe(false);
  });

  it("shares contact cards with server-filled details", async () => {
    const [m] = await t.as(alice).rpc<{ metadata: { username: string } }>("send_message", {
      p_conversation_id: direct, p_type: "contact", p_metadata: JSON.stringify({ user_id: carol }),
    });
    expect(m.metadata.username).toBe("carol");
  });

  it("blocking stops messaging in an existing chat", async () => {
    await t.as(bob).rpc("block_user", { p_other: alice });
    await expectDbError(t.as(alice).rpc("send_message", { p_conversation_id: direct, p_type: "text", p_body: "hi?" }), "cannot_message_user");
    await t.as(bob).rpc("unblock_user", { p_other: alice });
    await t.makeFriends(alice, bob);
  });

  it("searches only messages the user can read", async () => {
    const found = await t.as(bob).rpc<{ body: string }>("search_messages", { p_query: "hello" });
    expect(found.map((f) => f.body)).toContain("hello bob");
    expect(await t.as(eve).rpc("search_messages", { p_query: "hello" })).toHaveLength(0);
  });
});

describe("disappearing messages", () => {
  it("expired messages are hidden by RLS before cleanup and deleted by maintenance", async () => {
    await t.as(alice).rpc("set_disappearing_mode", { p_conversation_id: direct, p_mode: "24h" });
    const [m] = await t.as(alice).rpc<Msg & { expires_at: string }>("send_message", { p_conversation_id: direct, p_type: "text", p_body: "vanish" });
    expect(m.expires_at).not.toBeNull();
    await t.admin(`update public.messages set expires_at = now() - interval '1 second' where id = $1`, [m.id]);
    expect(await t.as(bob).query(`select 1 from public.messages where id = $1`, [m.id])).toHaveLength(0);
    await t.admin(`select public.run_maintenance()`);
    expect(await t.admin(`select 1 from public.messages where id = $1`, [m.id])).toHaveLength(0);
    await t.as(alice).rpc("set_disappearing_mode", { p_conversation_id: direct, p_mode: "off" });
  });

  it("clearing a conversation hides history for that user only", async () => {
    await t.as(bob).rpc("clear_conversation", { p_conversation_id: direct });
    expect(await t.as(bob).query(`select 1 from public.messages where conversation_id = $1`, [direct])).toHaveLength(0);
    expect((await t.as(alice).query(`select 1 from public.messages where conversation_id = $1`, [direct])).length).toBeGreaterThan(0);
  });
});

describe("groups", () => {
  it("creates groups only with friends", async () => {
    await expectDbError(t.as(alice).rpc("create_group", { p_name: "Bad", p_member_ids: [eve] }), "members_must_be_friends");
    const [g] = await t.as(alice).rpc<{ create_group: string }>("create_group", { p_name: "Crew", p_member_ids: [bob, carol] });
    group = g.create_group;
    const members = await t.as(bob).query<{ user_id: string; role: string }>(`select user_id, role from public.group_members where group_id = $1`, [group]);
    expect(members).toHaveLength(3);
    expect(members.find((m) => m.user_id === alice)?.role).toBe("owner");
    const invites = await t.as(carol).query(`select 1 from public.notifications where type = 'group_invite'`);
    expect(invites).toHaveLength(1);
  });

  it("enforces admin controls", async () => {
    await expectDbError(t.as(bob).rpc("remove_group_member", { p_conversation_id: group, p_user_id: carol }), "admins_only");
    await expectDbError(t.as(bob).rpc("update_group", { p_conversation_id: group, p_name: "Mine" }), "admins_only");
    await t.as(alice).rpc("set_group_role", { p_conversation_id: group, p_user_id: bob, p_role: "admin" });
    await t.as(bob).rpc("update_group", { p_conversation_id: group, p_name: "Crew 2" });
    await expectDbError(t.as(bob).rpc("remove_group_member", { p_conversation_id: group, p_user_id: alice }), "admins_only");
  });

  it("notifies mentions even when muted", async () => {
    await t.as(carol).rpc("set_conversation_muted", { p_conversation_id: group, p_until: new Date(Date.now() + 3600_000).toISOString() });
    await t.as(alice).rpc("send_message", { p_conversation_id: group, p_type: "text", p_body: "hey there everyone" });
    expect(await t.as(carol).query(`select 1 from public.notifications where type = 'message' and dedupe_key = $1`, [`msg:${group}`])).toHaveLength(0);
    await t.as(alice).rpc("send_message", { p_conversation_id: group, p_type: "text", p_body: "ping @carol" });
    expect(await t.as(carol).query(`select 1 from public.notifications where type = 'mention'`)).toHaveLength(1);
  });

  it("removed members lose access to new and old messages", async () => {
    await t.as(alice).rpc("remove_group_member", { p_conversation_id: group, p_user_id: carol });
    expect(await t.as(carol).query(`select 1 from public.messages where conversation_id = $1`, [group])).toHaveLength(0);
    await expectDbError(t.as(carol).rpc("send_message", { p_conversation_id: group, p_type: "text", p_body: "x" }), "conversation_not_found");
  });

  it("new members don't see history from before they joined", async () => {
    await t.as(alice).rpc("add_group_members", { p_conversation_id: group, p_user_ids: [carol] });
    const visible = await t.as(carol).query<Msg>(`select * from public.messages where conversation_id = $1 and type = 'text'`, [group]);
    expect(visible).toHaveLength(0);
  });

  it("transfers ownership when the owner leaves", async () => {
    await t.as(alice).rpc("leave_group", { p_conversation_id: group });
    const [owner] = await t.as(bob).query<{ user_id: string }>(`select user_id from public.conversation_members where conversation_id = $1 and role = 'owner'`, [group]);
    expect(owner.user_id).toBe(bob);
  });

  it("only admins can send when only_admins_send is on", async () => {
    await t.as(bob).rpc("update_group", { p_conversation_id: group, p_only_admins_send: true });
    await expectDbError(t.as(carol).rpc("send_message", { p_conversation_id: group, p_type: "text", p_body: "x" }), "only_admins_can_send");
  });
});

describe("live location", () => {
  it("is visible to conversation members only while active", async () => {
    const [msg] = await t.as(alice).rpc<{ metadata: { share_id: string } }>("start_location_share", {
      p_conversation_id: direct, p_lat: 12.97, p_lng: 77.59, p_accuracy: 10, p_minutes: 15,
    });
    const shareId = msg.metadata.share_id;
    expect(await t.as(bob).query(`select 1 from public.location_shares where id = $1`, [shareId])).toHaveLength(1);
    expect(await t.as(eve).query(`select 1 from public.location_shares where id = $1`, [shareId])).toHaveLength(0);
    await t.as(alice).rpc("stop_location_share", { p_share_id: shareId });
    expect(await t.as(bob).query(`select 1 from public.location_shares where id = $1`, [shareId])).toHaveLength(0);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

let t: TestDb;
let alice: string, bob: string, carol: string, dave: string;

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice");
  bob = await t.createUser("bob");
  carol = await t.createUser("carol");
  dave = await t.createUser("dave");
});
afterAll(async () => t?.close());

describe("friend requests", () => {
  it("sends, prevents duplicates, notifies, and accepts", async () => {
    const [sent] = await t.as(alice).rpc<{ send_friend_request: string }>("send_friend_request", { p_target: bob });
    expect(sent.send_friend_request).toBe("sent");
    const [again] = await t.as(alice).rpc<{ send_friend_request: string }>("send_friend_request", { p_target: bob });
    expect(again.send_friend_request).toBe("pending");

    const notes = await t.as(bob).query<{ type: string }>(`select type from public.notifications`);
    expect(notes.map((n) => n.type)).toContain("friend_request");

    const [req] = await t.as(bob).query<{ id: string }>(`select id from public.friend_requests where status = 'pending'`);
    await t.as(bob).rpc("respond_friend_request", { p_request_id: req.id, p_accept: true });
    const friends = await t.as(alice).rpc<{ username: string }>("my_friends");
    expect(friends.map((f) => f.username)).toEqual(["bob"]);

    const accepted = await t.as(alice).query<{ type: string }>(`select type from public.notifications where type = 'friend_accepted'`);
    expect(accepted).toHaveLength(1);
  });

  it("auto-accepts when the other person already sent a request", async () => {
    await t.as(carol).rpc("send_friend_request", { p_target: alice });
    const [res] = await t.as(alice).rpc<{ send_friend_request: string }>("send_friend_request", { p_target: carol });
    expect(res.send_friend_request).toBe("accepted");
  });

  it("does not let a third party answer someone else's request", async () => {
    await t.as(dave).rpc("send_friend_request", { p_target: bob });
    const [req] = await t.admin<{ id: string }>(`select id from public.friend_requests where sender_id = $1 and status = 'pending'`, [dave]);
    await expectDbError(t.as(alice).rpc("respond_friend_request", { p_request_id: req.id, p_accept: true }), "request_not_found");
    // and the requests are invisible to third parties
    const visible = await t.as(alice).query(`select id from public.friend_requests where id = $1`, [req.id]);
    expect(visible).toHaveLength(0);
  });

  it("cancels a sent request and removes the pending notification", async () => {
    const [req] = await t.admin<{ id: string }>(`select id from public.friend_requests where sender_id = $1 and status = 'pending'`, [dave]);
    await t.as(dave).rpc("cancel_friend_request", { p_request_id: req.id });
    const notes = await t.admin(`select 1 from public.notifications where dedupe_key = $1`, [`fr:${req.id}`]);
    expect(notes).toHaveLength(0);
  });

  it("respects who_can_add = nobody", async () => {
    await t.as(dave).query(`update public.user_settings set who_can_add = 'nobody' where user_id = auth.uid()`);
    await expectDbError(t.as(carol).rpc("send_friend_request", { p_target: dave }), "requests_disabled");
    await t.as(dave).query(`update public.user_settings set who_can_add = 'everyone' where user_id = auth.uid()`);
  });

  it("rejects friending yourself", async () => {
    await expectDbError(t.as(alice).rpc("send_friend_request", { p_target: alice }), "cannot_add_self");
  });

  it("computes mutual friends and suggestions", async () => {
    await t.makeFriends(bob, carol);
    const mutual = await t.as(bob).rpc<{ username: string }>("mutual_friends", { p_other: alice });
    expect(mutual.map((m) => m.username)).toEqual(["carol"]);
    const suggestions = await t.as(dave).rpc<{ username: string }>("friend_suggestions", { p_limit: 10 });
    expect(suggestions.map((s) => s.username)).toEqual(expect.arrayContaining(["alice", "bob", "carol"]));
    expect(suggestions.map((s) => s.username)).not.toContain("dave");
  });
});

describe("blocking", () => {
  it("removes friendship, hides profiles both ways, and blocks requests", async () => {
    await t.as(alice).rpc("block_user", { p_other: carol });
    const friends = await t.as(alice).rpc<{ username: string }>("my_friends");
    expect(friends.map((f) => f.username)).not.toContain("carol");

    const seenByCarol = await t.as(carol).query(`select id from public.profiles where id = $1`, [alice]);
    expect(seenByCarol).toHaveLength(0);
    const seenByAlice = await t.as(alice).query(`select id from public.profiles where id = $1`, [carol]);
    expect(seenByAlice).toHaveLength(0);

    await expectDbError(t.as(carol).rpc("send_friend_request", { p_target: alice }), "user_not_found");
    const search = await t.as(carol).rpc<{ username: string }>("search_users", { p_query: "ali" });
    expect(search.map((s) => s.username)).not.toContain("alice");

    const blocked = await t.as(alice).rpc<{ username: string }>("my_blocked_users");
    expect(blocked.map((b) => b.username)).toEqual(["carol"]);
  });

  it("unblocks", async () => {
    await t.as(alice).rpc("unblock_user", { p_other: carol });
    const seen = await t.as(carol).query(`select id from public.profiles where id = $1`, [alice]);
    expect(seen).toHaveLength(1);
  });
});

describe("profiles and settings", () => {
  it("checks username availability and reserved names", async () => {
    const [taken] = await t.as(null).rpc<{ check_username_available: boolean }>("check_username_available", { p_username: "alice" });
    expect(taken.check_username_available).toBe(false);
    const [reserved] = await t.as(null).rpc<{ check_username_available: boolean }>("check_username_available", { p_username: "admin" });
    expect(reserved.check_username_available).toBe(false);
    const [free] = await t.as(null).rpc<{ check_username_available: boolean }>("check_username_available", { p_username: "new.user_1" });
    expect(free.check_username_available).toBe(true);
    const [bad] = await t.as(null).rpc<{ check_username_available: boolean }>("check_username_available", { p_username: "a..b" });
    expect(bad.check_username_available).toBe(false);
  });

  it("anonymous visitors cannot read profiles", async () => {
    await expectDbError(t.as(null).query(`select * from public.profiles`), "permission denied");
  });

  it("users cannot escalate status or grant themselves admin", async () => {
    await expectDbError(t.as(bob).query(`update public.profiles set status = 'active', is_verified = true where id = auth.uid()`), "permission denied");
    await expectDbError(t.as(bob).query(`insert into public.admin_roles (user_id, role) values (auth.uid(), 'super_admin')`), "permission denied");
    await expectDbError(t.as(bob).rpc("admin_set_role", { p_user_id: bob, p_role: "super_admin" }), "forbidden");
  });

  it("users can update their own settings but not anyone else's", async () => {
    await t.as(bob).query(`update public.user_settings set read_receipts = false where user_id = auth.uid()`);
    const [s] = await t.admin<{ read_receipts: boolean }>(`select read_receipts from public.user_settings where user_id = $1`, [bob]);
    expect(s.read_receipts).toBe(false);
    await t.as(bob).query(`update public.user_settings set read_receipts = false where user_id = $1`, [alice]);
    const [a] = await t.admin<{ read_receipts: boolean }>(`select read_receipts from public.user_settings where user_id = $1`, [alice]);
    expect(a.read_receipts).toBe(true);
    await t.as(bob).query(`update public.user_settings set read_receipts = true where user_id = auth.uid()`);
  });

  it("updates profile fields through the RPC and validates media ownership", async () => {
    const [p] = await t.as(bob).rpc<{ display_name: string }>("update_profile", { p_display_name: "Bobby", p_bio: "hi" });
    expect(p.display_name).toBe("Bobby");
    const foreign = await t.createMedia(alice, "avatar");
    await expectDbError(t.as(bob).rpc("update_profile", { p_avatar_media_id: foreign }), "invalid_media");
  });

  it("enforces last-active visibility", async () => {
    // default: friends only. alice & bob are friends; dave is not.
    const forBob = await t.as(bob).rpc<{ user_id: string }>("get_presence", { p_ids: [alice] });
    expect(forBob).toHaveLength(1);
    const forDave = await t.as(dave).rpc<{ user_id: string }>("get_presence", { p_ids: [alice] });
    expect(forDave).toHaveLength(0);
    await t.as(alice).query(`update public.user_settings set last_active_visibility = 'nobody' where user_id = auth.uid()`);
    const hidden = await t.as(bob).rpc<{ user_id: string }>("get_presence", { p_ids: [alice] });
    expect(hidden).toHaveLength(0);
  });

  it("deactivation hides the account and re-activation restores it", async () => {
    await t.as(dave).rpc("set_account_active", { p_active: false });
    expect(await t.as(bob).query(`select 1 from public.profiles where id = $1`, [dave])).toHaveLength(0);
    await expectDbError(t.as(dave).rpc("send_friend_request", { p_target: bob }), "account_inactive");
    await t.as(dave).rpc("set_account_active", { p_active: true });
    expect(await t.as(bob).query(`select 1 from public.profiles where id = $1`, [dave])).toHaveLength(1);
  });

  it("profile_summary hides details of private accounts from non-friends", async () => {
    await t.as(dave).rpc("update_profile", { p_is_private: true });
    const [forCarol] = await t.as(carol).rpc<{ can_view_details: boolean; friend_count: number | null }>("profile_summary", { p_username: "dave" });
    expect(forCarol.can_view_details).toBe(false);
    expect(forCarol.friend_count).toBeNull();
    const [forSelf] = await t.as(dave).rpc<{ can_view_details: boolean }>("profile_summary", { p_username: "dave" });
    expect(forSelf.can_view_details).toBe(true);
  });
});

describe("follows and friend lists", () => {
  it("follows public profiles, refuses private non-friends", async () => {
    const [f] = await t.as(carol).rpc<{ toggle_follow: boolean }>("toggle_follow", { p_target: bob });
    expect(f.toggle_follow).toBe(true);
    const [u] = await t.as(carol).rpc<{ toggle_follow: boolean }>("toggle_follow", { p_target: bob });
    expect(u.toggle_follow).toBe(false);
    await expectDbError(t.as(carol).rpc("toggle_follow", { p_target: dave }), "private_account");
  });

  it("friend lists only include actual friends", async () => {
    const [list] = await t.as(alice).rpc<{ save_friend_list: string }>("save_friend_list", {
      p_list_id: null, p_name: "Close", p_member_ids: [bob, dave],
    });
    const members = await t.as(alice).query<{ user_id: string }>(`select user_id from public.friend_list_members where list_id = $1`, [list.save_friend_list]);
    expect(members.map((m) => m.user_id)).toEqual([bob]);
    expect(await t.as(bob).query(`select 1 from public.friend_lists`)).toHaveLength(0);
  });
});

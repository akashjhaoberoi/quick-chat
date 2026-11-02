import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

let t: TestDb;
let alice: string, bob: string, carol: string, mod: string, superAdmin: string;
let direct: string;

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice");
  bob = await t.createUser("bob");
  carol = await t.createUser("carol");
  mod = await t.createUser("mod");
  superAdmin = await t.createUser("boss");
  await t.makeFriends(alice, bob);
  await t.admin(`insert into public.admin_roles (user_id, role) values ($1, 'moderator'), ($2, 'super_admin')`, [mod, superAdmin]);
  const [c] = await t.as(alice).rpc<{ get_or_create_direct_conversation: string }>("get_or_create_direct_conversation", { p_other: bob });
  direct = c.get_or_create_direct_conversation;
});
afterAll(async () => t?.close());

describe("calls", () => {
  it("rings, joins, ends and records history", async () => {
    const [call] = await t.as(alice).rpc<{ id: string; status: string }>("start_call", { p_conversation_id: direct, p_kind: "video" });
    expect(call.status).toBe("ringing");
    expect(await t.as(bob).query(`select 1 from public.notifications where type = 'incoming_call'`)).toHaveLength(1);
    expect(await t.as(carol).query(`select 1 from public.calls where id = $1`, [call.id])).toHaveLength(0);
    await expectDbError(t.as(carol).rpc("join_call", { p_call_id: call.id }), "call_not_found");

    // a second start returns the live call rather than creating a duplicate
    const [again] = await t.as(bob).rpc<{ id: string }>("start_call", { p_conversation_id: direct, p_kind: "video" });
    expect(again.id).toBe(call.id);

    const [joined] = await t.as(bob).rpc<{ status: string }>("join_call", { p_call_id: call.id });
    expect(joined.status).toBe("active");
    await t.as(alice).rpc("leave_call", { p_call_id: call.id });
    const [ended] = await t.admin<{ status: string; ended_at: string }>(`select status, ended_at from public.calls where id = $1`, [call.id]);
    expect(ended.status).toBe("ended");
    expect(ended.ended_at).not.toBeNull();
    const history = await t.as(bob).rpc<{ status: string; is_outgoing: boolean }>("my_calls");
    expect(history[0]).toMatchObject({ status: "ended", is_outgoing: false });
  });

  it("declined calls end as declined", async () => {
    const [call] = await t.as(alice).rpc<{ id: string }>("start_call", { p_conversation_id: direct, p_kind: "audio" });
    await t.as(bob).rpc("decline_call", { p_call_id: call.id });
    const [row] = await t.admin<{ status: string }>(`select status from public.calls where id = $1`, [call.id]);
    expect(row.status).toBe("declined");
  });

  it("unanswered calls become missed and notify", async () => {
    const [call] = await t.as(alice).rpc<{ id: string }>("start_call", { p_conversation_id: direct, p_kind: "audio" });
    await t.admin(`update public.calls set created_at = now() - interval '2 minutes' where id = $1`, [call.id]);
    await t.admin(`select public.run_maintenance()`);
    const [row] = await t.admin<{ status: string }>(`select status from public.calls where id = $1`, [call.id]);
    expect(row.status).toBe("missed");
    expect(await t.as(bob).query(`select 1 from public.notifications where type = 'missed_call'`)).toHaveLength(1);
  });
});

describe("discover", () => {
  let post: string;
  it("creates posts with hashtags and marks the author as a creator", async () => {
    const media = await t.createMedia(carol, "post", "video", 12000);
    [{ create_post: post }] = await t.as(carol).rpc<{ create_post: string }>("create_post", {
      p_media_id: media, p_caption: "Sunset run #Travel #fitness",
    });
    const [p] = await t.admin<{ hashtags: string[] }>(`select hashtags from public.posts where id = $1`, [post]);
    expect(p.hashtags.sort()).toEqual(["fitness", "travel"]);
    const [prof] = await t.admin<{ is_creator: boolean }>(`select is_creator from public.profiles where id = $1`, [carol]);
    expect(prof.is_creator).toBe(true);
  });

  it("likes, comments, replies, saves and counts views", async () => {
    const [l] = await t.as(alice).rpc<{ toggle_post_like: boolean }>("toggle_post_like", { p_post_id: post });
    expect(l.toggle_post_like).toBe(true);
    const [c] = await t.as(alice).rpc<{ id: string }>("add_post_comment", { p_post_id: post, p_body: "wow" });
    await t.as(carol).rpc("add_post_comment", { p_post_id: post, p_body: "thanks", p_parent_id: c.id });
    await t.as(alice).rpc("toggle_saved_post", { p_post_id: post });
    await t.as(alice).rpc("record_post_view", { p_post_id: post });
    await t.as(alice).rpc("record_post_view", { p_post_id: post });
    const [p] = await t.admin<{ like_count: number; comment_count: number; view_count: number }>(
      `select like_count, comment_count, view_count from public.posts where id = $1`, [post]);
    expect(p).toEqual({ like_count: 1, comment_count: 2, view_count: 1 });
    const replies = await t.as(alice).query(`select 1 from public.notifications where type = 'post_comment'`);
    expect(replies).toHaveLength(1);
  });

  it("ranks the feed and filters by hashtag and mode", async () => {
    const feed = await t.as(bob).rpc<{ id: string; liked: boolean }>("discover_feed", { p_mode: "for_you" });
    expect(feed.map((f) => f.id)).toContain(post);
    const tagged = await t.as(bob).rpc<{ id: string }>("discover_feed", { p_mode: "trending", p_hashtag: "travel" });
    expect(tagged.map((f) => f.id)).toEqual([post]);
    const following = await t.as(bob).rpc("discover_feed", { p_mode: "following" });
    expect(following).toHaveLength(0);
    const tags = await t.as(bob).rpc<{ tag: string }>("trending_hashtags");
    expect(tags.map((x) => x.tag)).toEqual(expect.arrayContaining(["travel", "fitness"]));
  });

  it("hides posts from blocked users", async () => {
    await t.as(bob).rpc("block_user", { p_other: carol });
    expect(await t.as(bob).query(`select 1 from public.posts where id = $1`, [post])).toHaveLength(0);
    await t.as(bob).rpc("unblock_user", { p_other: carol });
  });
});

describe("reports and moderation", () => {
  let messageId: string;
  let reportId: string;

  it("snapshots reported messages so moderators never need raw message access", async () => {
    const [m] = await t.as(bob).rpc<{ id: string }>("send_message", { p_conversation_id: direct, p_type: "text", p_body: "abusive text" });
    messageId = m.id;
    // moderators cannot read private messages directly
    expect(await t.as(mod).query(`select 1 from public.messages where id = $1`, [messageId])).toHaveLength(0);
    // outsiders cannot report a message they cannot see
    await expectDbError(t.as(carol).rpc("create_report", { p_target_type: "message", p_target_id: messageId, p_reason: "harassment" }), "target_not_found");

    const [r] = await t.as(alice).rpc<{ create_report: string }>("create_report", {
      p_target_type: "message", p_target_id: messageId, p_reason: "harassment", p_details: "please review",
    });
    reportId = r.create_report;
    const [report] = await t.as(mod).query<{ snapshot: { body: string } }>(`select snapshot from public.reports where id = $1`, [reportId]);
    expect(report.snapshot.body).toBe("abusive text");
    // duplicate open reports are ignored
    const [dup] = await t.as(alice).rpc<{ create_report: string | null }>("create_report", {
      p_target_type: "message", p_target_id: messageId, p_reason: "harassment",
    });
    expect(dup.create_report).toBeNull();
    // regular users only see their own reports
    expect(await t.as(bob).query(`select 1 from public.reports`)).toHaveLength(0);
  });

  it("lets moderators remove reported content and resolve the report", async () => {
    await expectDbError(t.as(alice).rpc("admin_remove_content", { p_target_type: "message", p_target_id: messageId, p_reason: "x" }), "forbidden");
    await t.as(mod).rpc("admin_remove_content", { p_target_type: "message", p_target_id: messageId, p_reason: "harassment", p_report_id: reportId });
    await t.as(mod).rpc("admin_resolve_report", { p_report_id: reportId, p_resolution: "actioned", p_note: "removed" });
    const [msg] = await t.as(alice).query<{ deleted_at: string | null }>(`select deleted_at from public.messages where id = $1`, [messageId]);
    expect(msg.deleted_at).not.toBeNull();
    expect(await t.as(bob).query(`select 1 from public.notifications where type = 'moderation'`)).toHaveLength(1);
  });

  it("moderators can suspend but only admins can ban", async () => {
    await expectDbError(
      t.as(mod).rpc("admin_set_user_status", { p_user_id: bob, p_status: "banned", p_reason: "spam" }),
      "forbidden",
    );
    const [action] = await t.as(mod).rpc<{ admin_set_user_status: string }>("admin_set_user_status", {
      p_user_id: bob, p_status: "suspended", p_reason: "spam", p_days: 3,
    });
    await expectDbError(t.as(bob).rpc("send_message", { p_conversation_id: direct, p_type: "text", p_body: "x" }), "account_inactive");

    // the suspended user can appeal
    const [appeal] = await t.as(bob).rpc<{ submit_appeal: string }>("submit_appeal", {
      p_action_id: action.admin_set_user_status, p_message: "I was hacked",
    });
    await t.as(mod).rpc("admin_review_appeal", { p_appeal_id: appeal.submit_appeal, p_accept: true, p_response: "Restored" });
    const [p] = await t.admin<{ status: string }>(`select status from public.profiles where id = $1`, [bob]);
    expect(p.status).toBe("active");
  });

  it("writes an audit log visible only to admins", async () => {
    expect(await t.as(mod).query(`select 1 from public.admin_audit_logs`)).toHaveLength(0); // moderators lack 'admin'
    const logs = await t.as(superAdmin).query<{ action: string }>(`select action from public.admin_audit_logs`);
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["content.remove", "report.actioned", "user.suspended"]));
  });

  it("only super admins grant roles", async () => {
    await expectDbError(t.as(mod).rpc("admin_set_role", { p_user_id: carol, p_role: "admin" }), "forbidden");
    await t.as(superAdmin).rpc("admin_set_role", { p_user_id: carol, p_role: "admin" });
    const [r] = await t.admin<{ role: string }>(`select role from public.admin_roles where user_id = $1`, [carol]);
    expect(r.role).toBe("admin");
  });

  it("returns dashboard stats for admins only", async () => {
    await expectDbError(t.as(alice).rpc("admin_stats"), "forbidden");
    const [row] = await t.as(mod).rpc<{ admin_stats: { total_users: number } }>("admin_stats");
    expect(row.admin_stats.total_users).toBe(5);
  });

  it("protects maintenance and push claiming from end users", async () => {
    await expectDbError(t.as(alice).query(`select public.run_maintenance()`), "permission denied");
    await expectDbError(t.as(alice).query(`select * from public.claim_push_notifications(null, 10)`), "permission denied");
  });

  it("claims each push notification only once", async () => {
    await t.admin(`insert into public.push_subscriptions (user_id, token) values ($1, 'tok-1')`, [alice]);
    await t.admin(`update public.notifications set push_sent_at = now()`);
    await t.as(bob).rpc("send_message", { p_conversation_id: direct, p_type: "text", p_body: "push me" });
    const first = await t.admin<{ tokens: string[] }>(`select * from public.claim_push_notifications(null, 100)`);
    expect(first).toHaveLength(1);
    expect(first[0].tokens).toEqual(["tok-1"]);
    const second = await t.admin(`select * from public.claim_push_notifications(null, 100)`);
    expect(second).toHaveLength(0);
  });
});

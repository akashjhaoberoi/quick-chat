import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

let t: TestDb;
let alice: string, bob: string, carol: string, eve: string;

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

async function sendSnap(from: string, to: string[], opts: Record<string, unknown> = {}) {
  const media = await t.createMedia(from, "snap");
  const [row] = await t.as(from).rpc<{ send_snap: string }>("send_snap", {
    p_media_id: media, p_recipient_ids: to, p_duration_seconds: 5, ...opts,
  });
  return { snapId: row.send_snap, media };
}

describe("snaps", () => {
  it("can only be sent to friends", async () => {
    const media = await t.createMedia(alice, "snap");
    await expectDbError(t.as(alice).rpc("send_snap", { p_media_id: media, p_recipient_ids: [eve] }), "recipients_must_be_friends");
  });

  it("delivers to multiple recipients and notifies them", async () => {
    const { snapId } = await sendSnap(alice, [bob, carol]);
    const rec = await t.as(alice).query<{ status: string }>(`select status from public.snap_recipients where snap_id = $1`, [snapId]);
    expect(rec.map((r) => r.status)).toEqual(["delivered", "delivered"]);
    expect(await t.as(bob).query(`select 1 from public.notifications where type = 'snap'`)).toHaveLength(1);
    expect(await t.as(eve).query(`select 1 from public.snaps where id = $1`, [snapId])).toHaveLength(0);
  });

  it("opens once, grants media only during the view window, then denies", async () => {
    const { snapId, media } = await sendSnap(alice, [bob]);
    const [before] = await t.as(bob).rpc<{ can_access_media: boolean }>("can_access_media", { p_media_id: media });
    expect(before.can_access_media).toBe(false);

    const [opened] = await t.as(bob).rpc<{ media_id: string; view_expires_at: string }>("open_snap", { p_snap_id: snapId });
    expect(opened.media_id).toBe(media);
    const [during] = await t.as(bob).rpc<{ can_access_media: boolean }>("can_access_media", { p_media_id: media });
    expect(during.can_access_media).toBe(true);
    // carol is not a recipient
    const [other] = await t.as(carol).rpc<{ can_access_media: boolean }>("can_access_media", { p_media_id: media });
    expect(other.can_access_media).toBe(false);

    await t.admin(`update public.snap_recipients set view_expires_at = now() - interval '1 second' where snap_id = $1`, [snapId]);
    const [after] = await t.as(bob).rpc<{ can_access_media: boolean }>("can_access_media", { p_media_id: media });
    expect(after.can_access_media).toBe(false);
    await expectDbError(t.as(bob).rpc("open_snap", { p_snap_id: snapId }), "snap_already_viewed");

    // sender sees the opened status
    const [status] = await t.as(alice).query<{ status: string }>(`select status from public.snap_recipients where snap_id = $1`, [snapId]);
    expect(status.status).toBe("opened");

    // maintenance deletes the media once nobody can view it any more
    await t.admin(`select public.run_maintenance()`);
    const [m] = await t.admin<{ status: string }>(`select status from public.media_assets where id = $1`, [media]);
    expect(m.status).toBe("pending_delete");
  });

  it("allows exactly one replay when permitted", async () => {
    const { snapId } = await sendSnap(alice, [bob], { p_view_once: false, p_allow_replay: true });
    await t.as(bob).rpc("open_snap", { p_snap_id: snapId });
    await t.admin(`update public.snap_recipients set view_expires_at = now() - interval '1 second' where snap_id = $1`, [snapId]);
    const [replay] = await t.as(bob).rpc<{ replayed: boolean }>("open_snap", { p_snap_id: snapId, p_replay: true });
    expect(replay.replayed).toBe(true);
    await t.admin(`update public.snap_recipients set view_expires_at = now() - interval '1 second' where snap_id = $1`, [snapId]);
    await expectDbError(t.as(bob).rpc("open_snap", { p_snap_id: snapId, p_replay: true }), "snap_already_viewed");
  });

  it("view-once snaps can never be replayed", async () => {
    const { snapId } = await sendSnap(alice, [bob], { p_view_once: true, p_allow_replay: true });
    const [row] = await t.admin<{ allow_replay: boolean }>(`select allow_replay from public.snaps where id = $1`, [snapId]);
    expect(row.allow_replay).toBe(false);
  });

  it("unopened snaps expire server-side", async () => {
    const { snapId, media } = await sendSnap(alice, [bob], { p_expire_hours: 1 });
    await t.admin(`update public.snaps set expires_at = now() - interval '5 minutes' where id = $1`, [snapId]);
    expect(await t.as(bob).query(`select 1 from public.snaps where id = $1`, [snapId])).toHaveLength(0);
    await expectDbError(t.as(bob).rpc("open_snap", { p_snap_id: snapId }), "snap_expired");
    await t.admin(`select public.run_maintenance()`);
    const [r] = await t.admin<{ status: string }>(`select status from public.snap_recipients where snap_id = $1`, [snapId]);
    expect(r.status).toBe("expired");
    const [m] = await t.admin<{ status: string }>(`select status from public.media_assets where id = $1`, [media]);
    expect(m.status).toBe("pending_delete");
  });

  it("records screenshot reports and notifies the sender", async () => {
    const { snapId } = await sendSnap(alice, [carol]);
    await t.as(carol).rpc("open_snap", { p_snap_id: snapId });
    await t.as(carol).rpc("report_snap_screenshot", { p_snap_id: snapId });
    expect(await t.as(alice).query(`select 1 from public.notifications where type = 'snap_screenshot'`)).toHaveLength(1);
  });
});

describe("streaks and score", () => {
  it("counts a streak day only when both friends snap each other", async () => {
    const t2 = await createTestDb();
    try {
      const a = await t2.createUser("a1");
      const b = await t2.createUser("b1");
      await t2.makeFriends(a, b);
      const snap = async (from: string, to: string) => {
        const media = await t2.createMedia(from, "snap");
        await t2.as(from).rpc("send_snap", { p_media_id: media, p_recipient_ids: [to] });
      };
      await snap(a, b);
      type S = { count: number; expires_at: string; recoverable: boolean };
      let [s] = await t2.as(a).rpc<S>("my_streaks");
      expect(s.count).toBe(0);
      await snap(b, a);
      [s] = await t2.as(a).rpc<S>("my_streaks");
      expect(s.count).toBe(1);

      // Simulate the previous day being counted; today's mutual snaps extend it.
      await t2.admin(`update public.streaks set count = 5, last_counted_day = (now() at time zone 'utc')::date - 1,
                        a_last_day = null, b_last_day = null`);
      await snap(a, b);
      await snap(b, a);
      [s] = await t2.as(b).rpc<S>("my_streaks");
      expect(s.count).toBe(6);
      expect(new Date(s.expires_at).getTime()).toBeGreaterThan(Date.now());

      // A gap of more than one day ends the streak; maintenance records the loss.
      await t2.admin(`update public.streaks set last_counted_day = (now() at time zone 'utc')::date - 2`);
      [s] = await t2.as(a).rpc<S>("my_streaks");
      expect(s.count).toBe(0);
      await t2.admin(`select public.run_maintenance()`);
      [s] = await t2.as(a).rpc<S>("my_streaks");
      expect(s.recoverable).toBe(true);

      const [rec] = await t2.as(a).rpc<{ recover_streak: number }>("recover_streak", { p_other: b });
      expect(rec.recover_streak).toBe(6);
      await expectDbError(t2.as(b).rpc("recover_streak", { p_other: a }), "streak_not_recoverable");
    } finally {
      await t2.close();
    }
  });

  it("awards score server-side with daily caps and no direct writes", async () => {
    const [score] = await t.as(alice).query<{ score: number }>(`select score from public.user_scores where user_id = auth.uid()`);
    expect(Number(score.score)).toBeGreaterThan(0);
    await expectDbError(t.as(alice).query(`update public.user_scores set score = 999999 where user_id = auth.uid()`), "permission denied");
    await expectDbError(t.as(alice).query(`insert into public.score_events (user_id, delta, reason) values (auth.uid(), 1000, 'admin_adjust')`), "permission denied");
    const history = await t.as(alice).rpc<{ reason: string }>("score_history");
    expect(history.map((h) => h.reason)).toContain("snap_sent");
  });

  it("caps snap points per recipient per day", async () => {
    const t3 = await createTestDb();
    try {
      const a = await t3.createUser("a2");
      const b = await t3.createUser("b2");
      await t3.makeFriends(a, b);
      for (let i = 0; i < 12; i++) {
        const media = await t3.createMedia(a, "snap");
        await t3.as(a).rpc("send_snap", { p_media_id: media, p_recipient_ids: [b] });
      }
      const [row] = await t3.admin<{ s: number }>(`select coalesce(sum(delta), 0) s from public.score_events where user_id = $1 and reason = 'snap_sent'`, [a]);
      expect(Number(row.s)).toBe(10);
    } finally {
      await t3.close();
    }
  });
});

describe("stories", () => {
  let friendsStory: string;
  let customStory: string;
  let publicStory: string;

  it("respects friends / custom / public audiences", async () => {
    const m1 = await t.createMedia(alice, "story");
    [{ post_story: friendsStory }] = await t.as(alice).rpc<{ post_story: string }>("post_story", { p_media_id: m1, p_audience: "friends" });
    const m2 = await t.createMedia(alice, "story");
    [{ post_story: customStory }] = await t.as(alice).rpc<{ post_story: string }>("post_story", {
      p_media_id: m2, p_audience: "custom", p_custom_ids: [carol],
    });
    const m3 = await t.createMedia(alice, "story");
    [{ post_story: publicStory }] = await t.as(alice).rpc<{ post_story: string }>("post_story", { p_media_id: m3, p_audience: "public" });

    const bobSees = (await t.as(bob).query<{ id: string }>(`select id from public.stories`)).map((s) => s.id);
    expect(bobSees).toEqual(expect.arrayContaining([friendsStory, publicStory]));
    expect(bobSees).not.toContain(customStory);
    const carolSees = (await t.as(carol).query<{ id: string }>(`select id from public.stories`)).map((s) => s.id);
    expect(carolSees).toContain(customStory);
    const eveSees = (await t.as(eve).query<{ id: string }>(`select id from public.stories`)).map((s) => s.id);
    expect(eveSees).toEqual([publicStory]);
  });

  it("tracks views and reactions, visible only to the owner", async () => {
    await t.as(bob).rpc("record_story_view", { p_story_id: friendsStory });
    await t.as(bob).rpc("record_story_view", { p_story_id: friendsStory });
    await t.as(bob).rpc("react_to_story", { p_story_id: friendsStory, p_emoji: "😍" });
    const viewers = await t.as(alice).rpc<{ username: string; emoji: string }>("story_viewers", { p_story_id: friendsStory });
    expect(viewers).toEqual([expect.objectContaining({ username: "bob", emoji: "😍" })]);
    expect(await t.as(bob).rpc("story_viewers", { p_story_id: friendsStory })).toHaveLength(0);
    const [s] = await t.admin<{ view_count: number }>(`select view_count from public.stories where id = $1`, [friendsStory]);
    expect(s.view_count).toBe(1);
    expect(await t.as(alice).query(`select 1 from public.notifications where type = 'story_reaction'`)).toHaveLength(1);
  });

  it("feeds the carousel with unseen state", async () => {
    const feed = await t.as(bob).rpc<{ username: string; has_unseen: boolean }>("stories_feed");
    expect(feed.find((f) => f.username === "alice")?.has_unseen).toBe(true);
  });

  it("story replies go to a direct chat", async () => {
    const [c] = await t.as(bob).rpc<{ get_or_create_direct_conversation: string }>("get_or_create_direct_conversation", { p_other: alice });
    const [m] = await t.as(bob).rpc<{ type: string }>("send_message", {
      p_conversation_id: c.get_or_create_direct_conversation, p_type: "story_reply", p_body: "nice!",
      p_metadata: JSON.stringify({ story_id: friendsStory }),
    });
    expect(m.type).toBe("story_reply");
    await expectDbError(
      t.as(bob).rpc("send_message", {
        p_conversation_id: c.get_or_create_direct_conversation, p_type: "story_reply", p_body: "x",
        p_metadata: JSON.stringify({ story_id: customStory }),
      }),
      "story_not_found",
    );
  });

  it("expires after 24 hours and deletion removes media", async () => {
    await t.admin(`update public.stories set expires_at = now() - interval '1 second' where id = $1`, [friendsStory]);
    expect(await t.as(bob).query(`select 1 from public.stories where id = $1`, [friendsStory])).toHaveLength(0);
    await t.as(alice).rpc("delete_story", { p_story_id: publicStory });
    expect(await t.as(eve).query(`select 1 from public.stories where id = $1`, [publicStory])).toHaveLength(0);
    await t.admin(`select public.run_maintenance()`);
    const rows = await t.admin<{ status: string }>(
      `select m.status from public.media_assets m join public.stories s on s.media_id = m.id where s.id in ($1, $2)`,
      [friendsStory, publicStory],
    );
    expect(rows.map((r) => r.status)).toEqual(["pending_delete", "pending_delete"]);
  });
});

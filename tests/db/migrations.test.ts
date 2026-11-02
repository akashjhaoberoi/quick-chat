import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t?.close());

describe("migrations", () => {
  it("apply cleanly and create every required table", async () => {
    const rows = await t.admin<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = new Set(rows.map((r) => r.table_name));
    for (const table of [
      "profiles", "user_settings", "user_sessions", "friendships", "friend_requests", "conversations",
      "conversation_members", "messages", "message_reactions", "message_attachments", "snaps", "snap_recipients",
      "stories", "story_views", "story_reactions", "streaks", "user_scores", "calls", "call_participants",
      "notifications", "push_subscriptions", "blocks", "reports", "groups", "group_members", "follows", "posts",
      "post_comments", "post_likes", "saved_posts", "media_assets", "admin_roles", "admin_audit_logs",
      "moderation_actions",
    ]) {
      expect(names.has(table), `missing ${table}`).toBe(true);
    }
  });

  it("enables RLS on every public base table", async () => {
    const rows = await t.admin<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("creates a profile, settings, score and presence row for each new auth user", async () => {
    const id = await t.createUser("alice");
    const [p] = await t.admin<{ username: string }>(`select username from public.profiles where id = $1`, [id]);
    expect(p.username).toBe("alice");
    const [counts] = await t.admin<{ n: number }>(
      `select (select count(*) from public.user_settings where user_id = $1)
            + (select count(*) from public.user_scores where user_id = $1)
            + (select count(*) from public.user_presence where user_id = $1) as n`,
      [id],
    );
    expect(Number(counts.n)).toBe(3);
  });

  it("falls back to a generated username when the requested one is taken", async () => {
    const id = await t.createUser("alice");
    const [p] = await t.admin<{ username: string }>(`select username from public.profiles where id = $1`, [id]);
    expect(p.username).toMatch(/^user[0-9a-f]{10}$/);
  });

  it("runs maintenance without errors", async () => {
    const [row] = await t.admin<{ run_maintenance: Record<string, number> }>(`select public.run_maintenance()`);
    expect(row.run_maintenance).toHaveProperty("messages_expired");
  });
});

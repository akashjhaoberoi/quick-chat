import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

let t: TestDb;
let owner: string, viewer: string, shy: string, blocked: string;

type View = { anonymous: boolean; id: string | null; username: string | null };

beforeAll(async () => {
  t = await createTestDb();
  owner = await t.createUser("owner");
  viewer = await t.createUser("viewer");
  shy = await t.createUser("shy");
  blocked = await t.createUser("blocked");
  await t.as(shy).query(`update public.user_settings set profile_view_mode = 'anonymous' where user_id = $1`, [shy]);
});
afterAll(async () => t?.close());

const record = async (as: string, profile: string) =>
  (await t.as(as).rpc<{ record_profile_view: boolean }>("record_profile_view", { p_profile_id: profile }))[0].record_profile_view;
const views = (as: string) => t.as(as).rpc<View>("my_profile_views");

describe("profile views", () => {
  it("records a visit once per 24 hours and never the owner's own visits", async () => {
    expect(await record(viewer, owner)).toBe(true);
    expect(await record(viewer, owner)).toBe(false);
    expect(await record(owner, owner)).toBe(false);
    const list = await views(owner);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ anonymous: false, id: viewer, username: "viewer" });
    await t.admin(`update public.profile_views set viewed_at = now() - interval '25 hours' where viewer_user_id = $1`, [viewer]);
    expect(await record(viewer, owner)).toBe(true);
    const [stats] = await t.as(owner).rpc<{ unique_visitors: number; total_views: number }>("my_profile_view_stats");
    expect(Number(stats.unique_visitors)).toBe(1);
    expect(Number(stats.total_views)).toBe(2);
  });

  it("notifies the owner with the viewer's name, linking to their profile", async () => {
    const [n] = await t.as(owner).query<{ body: string; actor_id: string; data: { url: string } }>(
      `select body, actor_id, data from public.notifications where type = 'profile_view' and actor_id is not null`,
    );
    expect(n.body).toBe("@viewer viewed your profile");
    expect(n.actor_id).toBe(viewer);
    expect(n.data.url).toBe("/profile/viewer");
  });

  it("anonymous viewers are counted but never identified, in the list or the notification", async () => {
    expect(await record(shy, owner)).toBe(true);
    const anon = (await views(owner)).find((v) => v.anonymous)!;
    expect(anon.id).toBeNull();
    expect(anon.username).toBeNull();
    const [n] = await t.as(owner).query<{ body: string; actor_id: string | null }>(
      `select body, actor_id from public.notifications where type = 'profile_view' and actor_id is null`,
    );
    expect(n.body).toBe("Someone viewed your profile");
  });

  it("view records can't be read or written directly", async () => {
    await expectDbError(t.as(owner).query(`select * from public.profile_views`), "permission denied");
    await expectDbError(
      t.as(viewer).query(`insert into public.profile_views (profile_owner_id, viewer_user_id, visibility_mode) values ($1, $2, 'identifiable')`, [owner, viewer]),
      "permission denied",
    );
    await expectDbError(t.as(null).rpc("my_profile_views"), "permission denied");
  });

  it("respects blocking and the owner's tracking switch", async () => {
    expect(await record(blocked, owner)).toBe(true);
    await t.admin(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [owner, blocked]);
    expect((await views(owner)).some((v) => v.id === blocked)).toBe(false);
    await t.admin(`delete from public.profile_views where viewer_user_id = $1`, [blocked]);
    expect(await record(blocked, owner)).toBe(false);

    await t.as(owner).query(`update public.user_settings set profile_view_tracking = false where user_id = $1`, [owner]);
    await t.admin(`delete from public.profile_views`);
    expect(await record(viewer, owner)).toBe(false);
    expect(await views(owner)).toHaveLength(0);
  });
});

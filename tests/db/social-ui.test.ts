import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

let t: TestDb;
let alice: string, bob: string, carol: string, dave: string, erin: string;

type Row = { id: string; direction: string; user_id: string; username: string; mutual_count: number | string };

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice");
  bob = await t.createUser("bob");
  carol = await t.createUser("carol");
  dave = await t.createUser("dave");
  erin = await t.createUser("erin");
});
afterAll(async () => t?.close());

describe("my_friend_requests", () => {
  it("lists incoming and outgoing pending requests with mutual counts", async () => {
    await t.makeFriends(alice, carol);
    await t.makeFriends(bob, carol);
    await t.as(bob).rpc("send_friend_request", { p_target: alice });
    await t.as(alice).rpc("send_friend_request", { p_target: dave });

    const rows = await t.as(alice).rpc<Row>("my_friend_requests");
    const incoming = rows.find((r) => r.direction === "incoming");
    const outgoing = rows.find((r) => r.direction === "outgoing");
    expect(incoming?.username).toBe("bob");
    expect(Number(incoming?.mutual_count)).toBe(1);
    expect(outgoing?.username).toBe("dave");
    expect(Number(outgoing?.mutual_count)).toBe(0);

    const bobView = await t.as(bob).rpc<Row>("my_friend_requests");
    expect(bobView.map((r) => [r.direction, r.username])).toEqual([["outgoing", "alice"]]);
  });

  it("is invisible to third parties and excludes answered requests", async () => {
    const erinView = await t.as(erin).rpc<Row>("my_friend_requests");
    expect(erinView).toHaveLength(0);

    const [req] = (await t.as(alice).rpc<Row>("my_friend_requests")).filter((r) => r.direction === "incoming");
    await t.as(alice).rpc("respond_friend_request", { p_request_id: req.id, p_accept: false });
    const after = await t.as(alice).rpc<Row>("my_friend_requests");
    expect(after.map((r) => r.username)).toEqual(["dave"]);
  });

  it("hides requests involving blocked users", async () => {
    await t.as(erin).rpc("send_friend_request", { p_target: dave });
    expect((await t.as(dave).rpc<Row>("my_friend_requests")).map((r) => r.username).sort()).toEqual(["alice", "erin"]);
    await t.as(dave).rpc("block_user", { p_other: erin });
    expect((await t.as(dave).rpc<Row>("my_friend_requests")).map((r) => r.username)).toEqual(["alice"]);
  });

  it("is not callable anonymously", async () => {
    await expectDbError(t.as(null).rpc("my_friend_requests"), "permission denied");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

let t: TestDb;
let alice: string;

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice");
});
afterAll(async () => t?.close());

describe("registration gate", () => {
  it("allows sign-ups while registration is open", async () => {
    const id = await t.createUser("opener");
    const rows = await t.admin<{ username: string }>(`select username from public.profiles where id = $1`, [id]);
    expect(rows[0].username).toBe("opener");
  });

  it("rejects new auth users while registration is closed", async () => {
    await t.admin(`update public.app_settings set value = 'false'::jsonb where key = 'registration_open'`);
    await expectDbError(t.createUser("latecomer"), "registration_closed");
    const rows = await t.admin(`select 1 from public.profiles where username = 'latecomer'`);
    expect(rows).toHaveLength(0);
    await t.admin(`update public.app_settings set value = 'true'::jsonb where key = 'registration_open'`);
    await t.createUser("latecomer");
  });

  it("is not callable by end users", async () => {
    await expectDbError(t.as(alice).query(`select private.enforce_registration_open()`), "permission denied");
  });
});

describe("account self-service RPCs", () => {
  it("checks username availability (own name counts as available)", async () => {
    const [own] = await t.as(alice).rpc<{ check_username_available: boolean }>("check_username_available", { p_username: "alice" });
    expect(own.check_username_available).toBe(true);
    const [taken] = await t.as(null).rpc<{ check_username_available: boolean }>("check_username_available", { p_username: "alice" });
    expect(taken.check_username_available).toBe(false);
    const [reserved] = await t.as(null).rpc<{ check_username_available: boolean }>("check_username_available", { p_username: "admin" });
    expect(reserved.check_username_available).toBe(false);
  });

  it("deactivates and reactivates an account", async () => {
    await t.as(alice).rpc("set_account_active", { p_active: false });
    let rows = await t.admin<{ status: string }>(`select status from public.profiles where id = $1`, [alice]);
    expect(rows[0].status).toBe("deactivated");
    await t.as(alice).rpc("set_account_active", { p_active: true });
    rows = await t.admin<{ status: string }>(`select status from public.profiles where id = $1`, [alice]);
    expect(rows[0].status).toBe("active");
  });

  it("lets users update only the self-service settings columns", async () => {
    await t.as(alice).query(`update public.user_settings set theme = 'dark', notification_prefs = '{"snap": false}' where user_id = auth.uid()`);
    const rows = await t.admin<{ theme: string }>(`select theme from public.user_settings where user_id = $1`, [alice]);
    expect(rows[0].theme).toBe("dark");
    await expectDbError(t.as(alice).query(`update public.user_settings set user_id = user_id where user_id = auth.uid()`), "permission denied");
  });

  it("only exposes a user's own login activity", async () => {
    const bob = await t.createUser("bobby");
    await t.admin(`insert into public.user_sessions (user_id, event, device) values ($1, 'login', 'Chrome on Windows')`, [bob]);
    expect(await t.as(alice).query(`select * from public.user_sessions where user_id = $1`, [bob])).toHaveLength(0);
    expect(await t.as(bob).query(`select * from public.user_sessions`)).toHaveLength(1);
  });
});

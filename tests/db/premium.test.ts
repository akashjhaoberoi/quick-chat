import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

let t: TestDb;
let alice: string, bob: string, admin: string;

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice");
  bob = await t.createUser("bob");
  admin = await t.createUser("boss");
  await t.admin(`insert into public.admin_roles (user_id, role) values ($1, 'admin')`, [admin]);
});
afterAll(async () => t?.close());

const entitlements = async (user: string) => (await t.as(user).rpc<{ entitlement: string }>("my_entitlements")).map((r) => r.entitlement).sort();

/** What the server does after verifying a Razorpay payment (service role). */
async function apply(args: { user: string; plan: string; payment: string; order?: string | null; sub?: string | null; amount: number; status?: string; end?: string | null }) {
  const [row] = await t.admin<{ premium_apply_payment: Record<string, unknown> }>(
    `select public.premium_apply_payment($1, $2, $3, $4, $5, $6, 'INR', $7, 'upi', $8, 'test')`,
    [args.user, args.plan, args.payment, args.order ?? null, args.sub ?? null, args.amount, args.status ?? "captured", args.end ?? null],
  );
  return row.premium_apply_payment;
}

describe("premium plans", () => {
  it("has the three plans at ₹49, ₹299 and ₹1,999 with lifetime non-recurring", async () => {
    const plans = await t.as(alice).query<{ id: string; amount_paise: number; billing_interval: string }>(
      `select id, amount_paise, billing_interval from public.subscription_plans order by sort_order`,
    );
    expect(plans).toEqual([
      { id: "monthly", amount_paise: 4900, billing_interval: "month" },
      { id: "yearly", amount_paise: 29900, billing_interval: "year" },
      { id: "lifetime", amount_paise: 199900, billing_interval: "lifetime" },
    ]);
  });

  it("free users have no entitlements and premium-only functions refuse them", async () => {
    expect(await entitlements(alice)).toEqual([]);
    await expectDbError(t.as(alice).rpc("set_profile_theme", { p_theme: "ocean" }), "premium_required");
    await expectDbError(t.as(alice).rpc("my_profile_view_daily"), "premium_required");
  });
});

describe("payments", () => {
  it("users cannot grant themselves Premium or write payment rows", async () => {
    await expectDbError(
      t.as(alice).query(`insert into public.user_subscriptions (user_id, plan_id, status) values ($1, 'lifetime', 'active')`, [alice]),
      "permission denied",
    );
    await expectDbError(
      t.as(alice).rpc("premium_apply_payment", {
        p_user: alice, p_plan: "lifetime", p_payment_id: "pay_x", p_order_id: "order_x", p_subscription_id: null,
        p_amount: 199900, p_currency: "INR", p_status: "captured", p_method: "upi", p_period_end: null, p_source: "x",
      }),
      "permission denied",
    );
    await expectDbError(t.as(alice).rpc("admin_set_premium", { p_user_id: alice, p_grant: true }), "forbidden");
  });

  it("rejects a payment whose amount doesn't match the plan", async () => {
    await t.admin(`insert into public.payment_transactions (user_id, plan_id, razorpay_order_id, amount_paise, status) values ($1, 'lifetime', 'order_bad', 199900, 'created')`, [alice]);
    await expectDbError(apply({ user: alice, plan: "lifetime", payment: "pay_bad", order: "order_bad", amount: 100 }), "amount_mismatch");
    expect(await entitlements(alice)).toEqual([]);
  });

  it("a failed payment records history but grants nothing", async () => {
    const r = await apply({ user: alice, plan: "lifetime", payment: "pay_failed", order: "order_bad", amount: 199900, status: "failed" });
    expect(r.activated).toBe(false);
    expect(await entitlements(alice)).toEqual([]);
  });

  it("a captured lifetime payment activates lifetime access with no renewal date, once", async () => {
    await t.admin(`insert into public.payment_transactions (user_id, plan_id, razorpay_order_id, amount_paise, status) values ($1, 'lifetime', 'order_life', 199900, 'created')`, [alice]);
    const first = await apply({ user: alice, plan: "lifetime", payment: "pay_life", order: "order_life", amount: 199900 });
    expect(first.activated).toBe(true);
    const dup = await apply({ user: alice, plan: "lifetime", payment: "pay_life", order: "order_life", amount: 199900 });
    expect(dup.duplicate).toBe(true);
    expect(await entitlements(alice)).toEqual(["extended_uploads", "premium_badge", "premium_video_effects", "profile_analytics", "profile_themes"]);
    const subs = await t.as(alice).query<{ plan_id: string; status: string; access_until: string | null; current_period_end: string | null }>(
      `select plan_id, status, access_until, current_period_end from public.user_subscriptions`,
    );
    expect(subs).toEqual([{ plan_id: "lifetime", status: "active", access_until: null, current_period_end: null }]);
    const txs = await t.as(alice).query(`select 1 from public.payment_transactions where razorpay_payment_id = 'pay_life'`);
    expect(txs).toHaveLength(1);
    // Badge is public; themes now work.
    const [badge] = await t.as(bob).rpc<{ is_premium_user: boolean }>("is_premium_user", { p_user: alice });
    expect(badge.is_premium_user).toBe(true);
    await t.as(alice).rpc("set_profile_theme", { p_theme: "ocean" });
  });

  it("monthly: active until the period end, extended by renewals, expired by maintenance after it lapses", async () => {
    await t.admin(`insert into public.user_subscriptions (user_id, plan_id, status, razorpay_subscription_id) values ($1, 'monthly', 'pending', 'sub_m')`, [bob]);
    await expectDbError(apply({ user: bob, plan: "monthly", payment: "pay_m0", sub: "sub_m", amount: 4900, end: null }), "invalid_period");
    const end1 = new Date(Date.now() + 30 * 86_400_000).toISOString();
    expect((await apply({ user: bob, plan: "monthly", payment: "pay_m1", sub: "sub_m", amount: 4900, end: end1 })).activated).toBe(true);
    expect(await entitlements(bob)).toContain("premium_badge");

    const end2 = new Date(Date.now() + 60 * 86_400_000).toISOString();
    await apply({ user: bob, plan: "monthly", payment: "pay_m2", sub: "sub_m", amount: 4900, end: end2 });
    const [row] = await t.as(bob).query<{ access_until: string }>(`select access_until from public.user_subscriptions where razorpay_subscription_id = 'sub_m'`);
    expect(new Date(row.access_until).getTime()).toBe(new Date(end2).getTime());

    await t.admin(`update public.user_subscriptions set access_until = now() - interval '1 minute' where razorpay_subscription_id = 'sub_m'`);
    expect(await entitlements(bob)).toEqual([]);
    const [m] = await t.admin<{ run_premium_maintenance: { expired: number } }>(`select public.run_premium_maintenance()`);
    expect(m.run_premium_maintenance.expired).toBe(1);
  });

  it("a full refund removes the access it paid for", async () => {
    const [r] = await t.admin<{ premium_apply_refund: { status: string } }>(`select public.premium_apply_refund('pay_life', 199900)`);
    expect(r.premium_apply_refund.status).toBe("refunded");
    expect(await entitlements(alice)).toEqual([]);
  });

  it("admins can grant and revoke complimentary Premium; it's audited", async () => {
    await t.as(admin).rpc("admin_set_premium", { p_user_id: bob, p_grant: true, p_reason: "support goodwill" });
    expect(await entitlements(bob)).toContain("profile_analytics");
    await t.as(admin).rpc("admin_set_premium", { p_user_id: bob, p_grant: false, p_reason: "test over" });
    expect(await entitlements(bob)).toEqual([]);
    const logs = await t.admin(`select 1 from public.admin_audit_logs where action in ('premium_grant', 'premium_revoke')`);
    expect(logs).toHaveLength(2);
    const [stats] = await t.as(admin).rpc<{ admin_premium_stats: Record<string, number> }>("admin_premium_stats");
    expect(stats.admin_premium_stats.refunded).toBe(1);
    await expectDbError(t.as(alice).rpc("admin_premium_stats"), "forbidden");
  });

  it("webhook events and customers are invisible to users", async () => {
    await expectDbError(t.as(alice).query(`select * from public.payment_webhook_events`), "permission denied");
    await expectDbError(t.as(alice).query(`select * from public.razorpay_customers`), "permission denied");
  });
});

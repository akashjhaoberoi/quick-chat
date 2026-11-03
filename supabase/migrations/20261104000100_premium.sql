-- =============================================================================
-- Quick Chat Premium (Razorpay).
--   * subscription_plans: monthly ₹49, yearly ₹299 (recurring), lifetime ₹1,999
--     (one-time). Amounts live here, never in the client.
--   * user_subscriptions: access_until is the source of truth for access
--     (null only for lifetime). Written only by the server (service role)
--     after a verified payment.
--   * payment_transactions, payment_webhook_events (idempotency),
--     razorpay_customers, payment_audit_logs: service-role writes only.
--   * subscription_entitlements + private.has_entitlement: the single place
--     premium features are decided.
-- Card numbers, CVV and UPI PINs are never received or stored.
-- =============================================================================

create table public.subscription_plans (
  id                text primary key check (id in ('monthly', 'yearly', 'lifetime')),
  name              text not null,
  amount_paise      integer not null check (amount_paise > 0),
  currency          text not null default 'INR',
  billing_interval  text not null check (billing_interval in ('month', 'year', 'lifetime')),
  razorpay_plan_id  text unique,
  active            boolean not null default true,
  sort_order        smallint not null default 0
);
insert into public.subscription_plans (id, name, amount_paise, billing_interval, sort_order) values
  ('monthly',  'Monthly',  4900,   'month',    1),
  ('yearly',   'Yearly',   29900,  'year',     2),
  ('lifetime', 'Lifetime', 199900, 'lifetime', 3);

create table public.subscription_entitlements (
  plan_id     text not null references public.subscription_plans (id) on delete cascade,
  entitlement text not null check (entitlement in
                ('premium_badge', 'profile_themes', 'profile_analytics', 'extended_uploads', 'premium_video_effects')),
  primary key (plan_id, entitlement)
);
insert into public.subscription_entitlements (plan_id, entitlement)
select p.id, e.k
from public.subscription_plans p
cross join (values ('premium_badge'), ('profile_themes'), ('profile_analytics'), ('extended_uploads'), ('premium_video_effects')) as e (k);

create table public.razorpay_customers (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  razorpay_customer_id text not null unique,
  created_at           timestamptz not null default now()
);

create table public.user_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles (id) on delete cascade,
  plan_id                  text not null references public.subscription_plans (id),
  status                   text not null default 'pending'
                           check (status in ('pending', 'active', 'cancelled', 'halted', 'expired', 'refunded')),
  razorpay_subscription_id text unique,
  razorpay_order_id        text unique,
  started_at               timestamptz,
  current_period_end       timestamptz,
  -- Premium access ends here; null only for an active lifetime membership.
  access_until             timestamptz,
  cancel_at_period_end     boolean not null default false,
  cancelled_at             timestamptz,
  granted_by               uuid references public.profiles (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index user_subscriptions_user on public.user_subscriptions (user_id, created_at desc);
create unique index user_subscriptions_one_lifetime on public.user_subscriptions (user_id)
  where plan_id = 'lifetime' and status = 'active';
create trigger user_subscriptions_touch before update on public.user_subscriptions
  for each row execute function private.touch_updated_at();

create table public.payment_transactions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles (id) on delete cascade,
  plan_id                  text not null references public.subscription_plans (id),
  subscription_id          uuid references public.user_subscriptions (id) on delete set null,
  razorpay_order_id        text,
  razorpay_payment_id      text unique,
  razorpay_subscription_id text,
  amount_paise             integer not null check (amount_paise >= 0),
  currency                 text not null default 'INR',
  status                   text not null default 'created'
                           check (status in ('created', 'authorized', 'captured', 'failed', 'cancelled', 'refunded', 'partially_refunded')),
  method                   text,
  error_code               text,
  error_description        text,
  refunded_paise           integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index payment_transactions_user on public.payment_transactions (user_id, created_at desc);
create index payment_transactions_order on public.payment_transactions (razorpay_order_id);
create index payment_transactions_status on public.payment_transactions (status, created_at desc);
create trigger payment_transactions_touch before update on public.payment_transactions
  for each row execute function private.touch_updated_at();

create table public.payment_webhook_events (
  id           text primary key,          -- Razorpay x-razorpay-event-id
  event        text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

create table public.payment_audit_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index payment_audit_logs_user on public.payment_audit_logs (user_id, created_at desc);

-- Premium profile theme (applied on the profile page; set via set_profile_theme).
alter table public.profiles
  add column profile_theme text not null default 'default'
    check (profile_theme in ('default', 'sunset', 'ocean', 'forest', 'midnight', 'rose'));

alter table public.subscription_plans        enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.razorpay_customers        enable row level security;
alter table public.user_subscriptions        enable row level security;
alter table public.payment_transactions      enable row level security;
alter table public.payment_webhook_events    enable row level security;
alter table public.payment_audit_logs        enable row level security;

create policy subscription_plans_read on public.subscription_plans for select to authenticated using (true);
create policy subscription_entitlements_read on public.subscription_entitlements for select to authenticated using (true);
create policy user_subscriptions_own on public.user_subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin('admin')));
create policy payment_transactions_own on public.payment_transactions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin('admin')));
create policy payment_audit_logs_admin on public.payment_audit_logs for select to authenticated
  using ((select private.is_admin('admin')));
-- razorpay_customers, payment_webhook_events: service role only.

revoke all on public.subscription_plans, public.subscription_entitlements, public.razorpay_customers,
  public.user_subscriptions, public.payment_transactions, public.payment_webhook_events, public.payment_audit_logs from anon;
revoke insert, update, delete, truncate on public.subscription_plans, public.subscription_entitlements, public.razorpay_customers,
  public.user_subscriptions, public.payment_transactions, public.payment_webhook_events, public.payment_audit_logs from authenticated;
revoke select on public.razorpay_customers, public.payment_webhook_events from authenticated;

-- -----------------------------------------------------------------------------
-- Entitlements
-- -----------------------------------------------------------------------------
create or replace function private.premium_plan(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select s.plan_id from public.user_subscriptions s
  where s.user_id = p_user and s.status in ('active', 'cancelled', 'halted')
    and (s.access_until is null and s.plan_id = 'lifetime' and s.status = 'active' or s.access_until > now())
  order by (s.plan_id = 'lifetime') desc, s.access_until desc nulls first
  limit 1
$$;

create or replace function private.has_entitlement(p_user uuid, p_entitlement text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscription_entitlements e
                 where e.plan_id = private.premium_plan(p_user) and e.entitlement = p_entitlement)
$$;

create or replace function public.my_entitlements()
returns table (entitlement text) language sql stable security definer set search_path = '' as $$
  select e.entitlement from public.subscription_entitlements e where e.plan_id = private.premium_plan(auth.uid())
$$;

-- Premium status is shown publicly as a badge.
create or replace function public.is_premium_user(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_entitlement(p_user, 'premium_badge')
$$;

-- Badge + theme for a profile page. The theme falls back to default when
-- Premium lapses (the stored choice is kept for when it comes back).
create or replace function public.profile_premium(p_user uuid)
returns table (premium boolean, theme text) language sql stable security definer set search_path = '' as $$
  select private.has_entitlement(p.id, 'premium_badge'),
         case when private.has_entitlement(p.id, 'profile_themes') then p.profile_theme else 'default' end
  from public.profiles p
  where p.id = p_user and (p.id = auth.uid() or (p.status = 'active' and not private.is_blocked(p.id, auth.uid())))
$$;
revoke execute on function public.profile_premium(uuid) from public, anon;
grant execute on function public.profile_premium(uuid) to authenticated, service_role;

create or replace function public.set_profile_theme(p_theme text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  if p_theme <> 'default' and not private.has_entitlement(v_me, 'profile_themes') then
    raise exception 'premium_required' using errcode = '42501';
  end if;
  update public.profiles set profile_theme = p_theme where id = v_me;
end $$;

-- Premium analytics: profile views per day for the last 30 days.
create or replace function public.my_profile_view_daily()
returns table (day date, views bigint, unique_visitors bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_entitlement(auth.uid(), 'profile_analytics') then
    raise exception 'premium_required' using errcode = '42501';
  end if;
  return query
    select d::date, count(v.id), count(distinct v.viewer_user_id)
    from generate_series(current_date - 29, current_date, interval '1 day') d
    left join public.profile_views v
      on v.profile_owner_id = auth.uid() and v.viewed_at >= d and v.viewed_at < d + interval '1 day'
    group by d order by d;
end $$;

-- -----------------------------------------------------------------------------
-- Payment application (service role only; called by the API after signature
-- verification and a server-side fetch of the payment from Razorpay).
-- Idempotent per razorpay_payment_id.
-- -----------------------------------------------------------------------------
create or replace function public.premium_apply_payment(
  p_user uuid, p_plan text, p_payment_id text, p_order_id text, p_subscription_id text,
  p_amount integer, p_currency text, p_status text, p_method text, p_period_end timestamptz,
  p_source text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.subscription_plans;
  v_sub  public.user_subscriptions;
  v_tx   public.payment_transactions;
  v_prev text;
begin
  select * into v_plan from public.subscription_plans where id = p_plan;
  if v_plan.id is null then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  if p_status not in ('authorized', 'captured', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select status into v_prev from public.payment_transactions where razorpay_payment_id = p_payment_id for update;
  if v_prev in ('captured', 'refunded', 'partially_refunded') and p_status <> 'failed' then
    return jsonb_build_object('duplicate', true);
  end if;

  -- Find the subscription row this payment belongs to.
  if p_subscription_id is not null then
    select * into v_sub from public.user_subscriptions where razorpay_subscription_id = p_subscription_id and user_id = p_user for update;
  elsif p_order_id is not null then
    select * into v_sub from public.user_subscriptions where razorpay_order_id = p_order_id and user_id = p_user for update;
  end if;

  update public.payment_transactions
     set razorpay_payment_id = p_payment_id, status = p_status, method = p_method, amount_paise = p_amount,
         subscription_id = coalesce(subscription_id, v_sub.id)
   where razorpay_payment_id is null and razorpay_order_id = p_order_id and user_id = p_user
   returning * into v_tx;
  if v_tx.id is null then
    insert into public.payment_transactions (user_id, plan_id, subscription_id, razorpay_order_id, razorpay_payment_id,
                                             razorpay_subscription_id, amount_paise, currency, status, method)
    values (p_user, p_plan, v_sub.id, p_order_id, p_payment_id, p_subscription_id, p_amount, coalesce(p_currency, 'INR'), p_status, p_method)
    on conflict (razorpay_payment_id) do update set status = excluded.status, method = excluded.method
    returning * into v_tx;
  end if;

  if p_status = 'failed' then
    insert into public.payment_audit_logs (user_id, action, details)
    values (p_user, 'payment_failed', jsonb_build_object('payment_id', p_payment_id, 'plan', p_plan, 'source', p_source));
    return jsonb_build_object('activated', false, 'status', 'failed');
  end if;

  -- Never grant for a wrong amount or currency.
  if p_amount <> v_plan.amount_paise or coalesce(p_currency, 'INR') <> v_plan.currency then
    insert into public.payment_audit_logs (user_id, action, details)
    values (p_user, 'amount_mismatch', jsonb_build_object('payment_id', p_payment_id, 'plan', p_plan, 'amount', p_amount));
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;

  if p_plan = 'lifetime' then
    if v_sub.id is null then
      insert into public.user_subscriptions (user_id, plan_id, razorpay_order_id)
      values (p_user, 'lifetime', p_order_id) returning * into v_sub;
    end if;
    update public.user_subscriptions
       set status = 'active', started_at = coalesce(started_at, now()), access_until = null, current_period_end = null
     where id = v_sub.id;
  else
    if v_sub.id is null then
      raise exception 'subscription_not_found' using errcode = 'P0002';
    end if;
    if p_period_end is null or p_period_end <= now() then
      raise exception 'invalid_period' using errcode = '22023';
    end if;
    update public.user_subscriptions
       set status = case when cancel_at_period_end then 'cancelled' else 'active' end,
           started_at = coalesce(started_at, now()),
           current_period_end = greatest(coalesce(current_period_end, p_period_end), p_period_end),
           access_until = greatest(coalesce(access_until, p_period_end), p_period_end)
     where id = v_sub.id;
  end if;
  update public.payment_transactions set subscription_id = v_sub.id where id = v_tx.id;

  insert into public.payment_audit_logs (user_id, action, details)
  values (p_user, 'premium_activated', jsonb_build_object('payment_id', p_payment_id, 'plan', p_plan, 'source', p_source));
  return jsonb_build_object('activated', true, 'subscription_id', v_sub.id);
end $$;

-- Refunds: a full refund ends the access the payment bought.
create or replace function public.premium_apply_refund(p_payment_id text, p_refunded_paise integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tx public.payment_transactions;
begin
  select * into v_tx from public.payment_transactions where razorpay_payment_id = p_payment_id for update;
  if v_tx.id is null then
    return jsonb_build_object('found', false);
  end if;
  update public.payment_transactions
     set refunded_paise = greatest(refunded_paise, p_refunded_paise),
         status = case when greatest(refunded_paise, p_refunded_paise) >= amount_paise then 'refunded' else 'partially_refunded' end
   where id = v_tx.id returning * into v_tx;
  if v_tx.status = 'refunded' and v_tx.subscription_id is not null then
    update public.user_subscriptions set status = 'refunded', access_until = now() where id = v_tx.subscription_id;
  end if;
  insert into public.payment_audit_logs (user_id, action, details)
  values (v_tx.user_id, 'refund', jsonb_build_object('payment_id', p_payment_id, 'refunded_paise', p_refunded_paise, 'status', v_tx.status));
  return jsonb_build_object('found', true, 'status', v_tx.status);
end $$;

-- Expire lapsed access (cron).
create or replace function public.run_premium_maintenance()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_expired integer;
  v_stale integer;
begin
  update public.user_subscriptions set status = 'expired'
   where status in ('active', 'cancelled', 'halted') and access_until is not null and access_until <= now();
  get diagnostics v_expired = row_count;
  -- Checkouts that were never paid.
  update public.user_subscriptions set status = 'expired'
   where status = 'pending' and created_at < now() - interval '2 days';
  get diagnostics v_stale = row_count;
  update public.payment_transactions set status = 'cancelled'
   where status = 'created' and created_at < now() - interval '2 days';
  return jsonb_build_object('expired', v_expired, 'abandoned_checkouts', v_stale);
end $$;

-- Admin overview (admins only).
create or replace function public.admin_premium_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'premium_users', (select count(distinct user_id) from public.user_subscriptions s
                      where private.premium_plan(s.user_id) is not null),
    'monthly', (select count(*) from public.user_subscriptions where plan_id = 'monthly' and status in ('active', 'halted')),
    'yearly', (select count(*) from public.user_subscriptions where plan_id = 'yearly' and status in ('active', 'halted')),
    'lifetime', (select count(*) from public.user_subscriptions where plan_id = 'lifetime' and status = 'active'),
    'cancelled', (select count(*) from public.user_subscriptions where status = 'cancelled'),
    'revenue_paise', (select coalesce(sum(amount_paise - refunded_paise), 0) from public.payment_transactions
                      where status in ('captured', 'partially_refunded')),
    'successful', (select count(*) from public.payment_transactions where status = 'captured'),
    'failed', (select count(*) from public.payment_transactions where status = 'failed'),
    'refunded', (select count(*) from public.payment_transactions where status in ('refunded', 'partially_refunded'))
  );
end $$;

-- Admin entitlement management: complimentary Premium (lifetime plan, no
-- payment) or revoke all current access. Admin role required; audited.
create or replace function public.admin_set_premium(p_user_id uuid, p_grant boolean, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin('admin');
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if p_grant then
    if not exists (select 1 from public.user_subscriptions where user_id = p_user_id and plan_id = 'lifetime' and status = 'active') then
      insert into public.user_subscriptions (user_id, plan_id, status, started_at, granted_by)
      values (p_user_id, 'lifetime', 'active', now(), v_admin);
    end if;
  else
    update public.user_subscriptions set status = 'expired', access_until = now()
     where user_id = p_user_id and status in ('active', 'cancelled', 'halted');
  end if;
  perform private.admin_log(case when p_grant then 'premium_grant' else 'premium_revoke' end, 'user', p_user_id::text,
                            jsonb_build_object('reason', left(coalesce(p_reason, ''), 500)));
  insert into public.payment_audit_logs (user_id, actor_id, action, details)
  values (p_user_id, v_admin, case when p_grant then 'admin_grant' else 'admin_revoke' end, jsonb_build_object('reason', left(coalesce(p_reason, ''), 500)));
end $$;

revoke execute on function public.admin_set_premium(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_premium(uuid, boolean, text) to authenticated, service_role;

revoke execute on function private.premium_plan(uuid) from public, anon;
revoke execute on function private.has_entitlement(uuid, text) from public, anon;
revoke execute on function public.my_entitlements() from public, anon;
revoke execute on function public.is_premium_user(uuid) from public, anon;
revoke execute on function public.set_profile_theme(text) from public, anon;
revoke execute on function public.my_profile_view_daily() from public, anon;
revoke execute on function public.premium_apply_payment(uuid, text, text, text, text, integer, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.premium_apply_refund(text, integer) from public, anon, authenticated;
revoke execute on function public.run_premium_maintenance() from public, anon, authenticated;
revoke execute on function public.admin_premium_stats() from public, anon;

grant execute on function private.premium_plan(uuid) to authenticated, service_role;
grant execute on function private.has_entitlement(uuid, text) to authenticated, service_role;
grant execute on function public.my_entitlements() to authenticated, service_role;
grant execute on function public.is_premium_user(uuid) to authenticated, service_role;
grant execute on function public.set_profile_theme(text) to authenticated, service_role;
grant execute on function public.my_profile_view_daily() to authenticated, service_role;
grant execute on function public.premium_apply_payment(uuid, text, text, text, text, integer, text, text, text, timestamptz, text) to service_role;
grant execute on function public.premium_apply_refund(text, integer) to service_role;
grant execute on function public.run_premium_maintenance() to service_role;
grant execute on function public.admin_premium_stats() to authenticated, service_role;

-- =============================================================================
-- Quick Chat — foundation schema
-- Profiles, settings, presence, scores, admin roles, media, notifications,
-- login activity, application settings.
--
-- Conventions
--   * public.*   tables + RPCs exposed through PostgREST (RLS enforced).
--   * private.*  helpers / internals. Not exposed by PostgREST.
--   * Clients never write sensitive tables directly; writes go through
--     SECURITY DEFINER RPCs that validate auth.uid().
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function private.is_reserved_username(p_name text)
returns boolean language sql immutable as $$
  select p_name = any (array[
    'admin','administrator','root','support','help','quickchat','quick_chat',
    'akarika','akarikatech','moderator','mod','system','official','security',
    'staff','team','api','settings','null','undefined','me','everyone'
  ])
$$;

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text not null unique
                   check (username ~ '^[a-z0-9_.]{3,20}$' and username !~ '(^\.|\.$|\.\.)'),
  display_name     text not null default '' check (char_length(display_name) <= 50),
  bio              text not null default '' check (char_length(bio) <= 300),
  avatar_media_id  uuid,
  cover_media_id   uuid,
  is_private       boolean not null default false,
  is_creator       boolean not null default false,
  is_verified      boolean not null default false,
  status           text not null default 'active'
                   check (status in ('active', 'deactivated', 'suspended', 'banned')),
  suspended_until  timestamptz,
  onboarded        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_username_trgm on public.profiles using gin (username extensions.gin_trgm_ops);
create index profiles_display_name_trgm on public.profiles using gin (display_name extensions.gin_trgm_ops);
create index profiles_status_idx on public.profiles (status);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- User settings (privacy + notification preferences)
-- -----------------------------------------------------------------------------
create table public.user_settings (
  user_id                uuid primary key references public.profiles (id) on delete cascade,
  theme                  text not null default 'system' check (theme in ('system', 'light', 'dark')),
  who_can_message        text not null default 'friends' check (who_can_message in ('everyone', 'friends')),
  who_can_add            text not null default 'everyone'
                         check (who_can_add in ('everyone', 'friends_of_friends', 'nobody')),
  last_active_visibility text not null default 'friends'
                         check (last_active_visibility in ('everyone', 'friends', 'nobody')),
  read_receipts          boolean not null default true,
  discoverable           boolean not null default true,
  show_score             boolean not null default true,
  story_default_audience text not null default 'friends' check (story_default_audience in ('public', 'friends')),
  location_sharing       boolean not null default false,
  notification_prefs     jsonb not null default '{}'::jsonb,
  push_enabled           boolean not null default true,
  email_security_alerts  boolean not null default true,
  updated_at             timestamptz not null default now()
);
create trigger user_settings_touch before update on public.user_settings
  for each row execute function private.touch_updated_at();

-- Presence is kept apart from profiles so its visibility can be restricted.
create table public.user_presence (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Scores (written only by private.award_score)
-- -----------------------------------------------------------------------------
create table public.user_scores (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  score      bigint not null default 0 check (score >= 0),
  updated_at timestamptz not null default now()
);

create table public.score_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  delta      integer not null,
  reason     text not null check (reason in ('snap_sent', 'snap_opened', 'story_posted', 'streak_day', 'admin_adjust')),
  ref_id     uuid,
  created_at timestamptz not null default now()
);
create index score_events_user_time on public.score_events (user_id, created_at desc);
create index score_events_user_reason_time on public.score_events (user_id, reason, created_at);

-- -----------------------------------------------------------------------------
-- Admin roles. Only grantable by a super admin (RPC) or by SQL bootstrap.
-- -----------------------------------------------------------------------------
create table public.admin_roles (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  role       text not null check (role in ('moderator', 'admin', 'super_admin')),
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now()
);

create or replace function private.is_admin(p_min text default 'moderator', p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_roles r
    where r.user_id = p_user
      and case p_min
            when 'moderator'   then true
            when 'admin'       then r.role in ('admin', 'super_admin')
            when 'super_admin' then r.role = 'super_admin'
            else false
          end
  )
$$;

create or replace function private.is_active_user(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_user and status = 'active')
$$;

-- -----------------------------------------------------------------------------
-- Media assets. Rows are created by the server (service role) when issuing an
-- upload URL; objects live in Cloudflare R2 or Supabase Storage.
-- -----------------------------------------------------------------------------
create table public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references public.profiles (id) on delete set null,
  provider     text not null check (provider in ('r2', 'supabase')),
  object_key   text not null unique,
  kind         text not null check (kind in ('image', 'video', 'audio', 'document')),
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0),
  width        integer,
  height       integer,
  duration_ms  integer,
  file_name    text,
  purpose      text not null check (purpose in ('avatar', 'cover', 'message', 'snap', 'story', 'post', 'group_avatar')),
  status       text not null default 'pending' check (status in ('pending', 'ready', 'pending_delete', 'deleted')),
  created_at   timestamptz not null default now(),
  ready_at     timestamptz,
  delete_after timestamptz
);
create index media_owner_idx on public.media_assets (owner_id, created_at desc);
create index media_status_idx on public.media_assets (status) where status in ('pending', 'pending_delete');

alter table public.profiles
  add constraint profiles_avatar_fk foreign key (avatar_media_id) references public.media_assets (id) on delete set null,
  add constraint profiles_cover_fk  foreign key (cover_media_id)  references public.media_assets (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Notifications + push subscriptions
-- -----------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  type         text not null check (type in (
                 'message', 'friend_request', 'friend_accepted', 'incoming_call', 'missed_call',
                 'snap', 'snap_opened', 'snap_screenshot', 'story_reaction', 'story_reply',
                 'streak_reminder', 'mention', 'group_invite', 'security', 'system',
                 'post_like', 'post_comment', 'follow', 'moderation')),
  actor_id     uuid references public.profiles (id) on delete set null,
  title        text not null,
  body         text not null default '',
  data         jsonb not null default '{}'::jsonb,
  entity_type  text,
  entity_id    uuid,
  dedupe_key   text,
  count        integer not null default 1,
  read_at      timestamptz,
  push_sent_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_time on public.notifications (user_id, created_at desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;
create index notifications_push_pending on public.notifications (created_at) where push_sent_at is null;

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  token        text not null unique,
  platform     text not null default 'web',
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

-- Inserts (or refreshes) a notification honouring the recipient's preferences
-- and blocks. p_refire=true re-arms an existing deduped notification (used for
-- chat messages: one row per conversation); otherwise duplicates are dropped.
create or replace function private.notify(
  p_user uuid, p_type text, p_actor uuid, p_title text, p_body text,
  p_data jsonb default '{}'::jsonb, p_entity_type text default null, p_entity_id uuid default null,
  p_dedupe text default null, p_refire boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_prefs jsonb;
begin
  if p_user is null or p_user = p_actor then
    return null;
  end if;
  if p_actor is not null and private.is_blocked(p_user, p_actor) then
    return null;
  end if;
  select notification_prefs into v_prefs from public.user_settings where user_id = p_user;
  if p_type not in ('security', 'moderation') and coalesce((v_prefs ->> p_type)::boolean, true) = false then
    return null;
  end if;

  if p_dedupe is null then
    insert into public.notifications (user_id, type, actor_id, title, body, data, entity_type, entity_id)
    values (p_user, p_type, p_actor, p_title, left(p_body, 280), p_data, p_entity_type, p_entity_id)
    returning id into v_id;
  elsif p_refire then
    insert into public.notifications (user_id, type, actor_id, title, body, data, entity_type, entity_id, dedupe_key)
    values (p_user, p_type, p_actor, p_title, left(p_body, 280), p_data, p_entity_type, p_entity_id, p_dedupe)
    on conflict (user_id, dedupe_key) do update
      set title = excluded.title, body = excluded.body, data = excluded.data, actor_id = excluded.actor_id,
          count = case when public.notifications.read_at is null then public.notifications.count + 1 else 1 end,
          created_at = now(), read_at = null, push_sent_at = null
    returning id into v_id;
  else
    insert into public.notifications (user_id, type, actor_id, title, body, data, entity_type, entity_id, dedupe_key)
    values (p_user, p_type, p_actor, p_title, left(p_body, 280), p_data, p_entity_type, p_entity_id, p_dedupe)
    on conflict (user_id, dedupe_key) do nothing
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Login activity / security events (written by the server)
-- -----------------------------------------------------------------------------
create table public.user_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  session_id  uuid,
  event       text not null check (event in (
                'login', 'logout', 'signup', 'password_changed', 'password_reset',
                'mfa_enabled', 'mfa_disabled', 'session_revoked', 'account_deactivated',
                'account_reactivated', 'email_changed')),
  ip          text,
  user_agent  text,
  device      text,
  created_at  timestamptz not null default now()
);
create index user_sessions_user_time on public.user_sessions (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Application settings + announcements (admin managed)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  is_public  boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value, is_public) values
  ('maintenance_mode', '{"enabled": false, "message": ""}', true),
  ('registration_open', 'true', true),
  ('content_policy', '{"version": 1, "url": "/legal/community-guidelines"}', true),
  ('limits', '{"max_upload_mb_image": 15, "max_upload_mb_video": 100, "daily_upload_mb": 1024}', true);

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 120),
  body       text not null default '' check (char_length(body) <= 1000),
  level      text not null default 'info' check (level in ('info', 'warning', 'critical')),
  active     boolean not null default true,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- New auth user -> profile, settings, score, presence
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_candidate text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_username  text;
  v_display   text;
begin
  if v_candidate ~ '^[a-z0-9_.]{3,20}$'
     and v_candidate !~ '(^\.|\.$|\.\.)'
     and not private.is_reserved_username(v_candidate)
     and not exists (select 1 from public.profiles where username = v_candidate) then
    v_username := v_candidate;
  else
    v_username := 'user' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  v_display := left(coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, ''), '@', 1)
  ), 50);

  insert into public.profiles (id, username, display_name) values (new.id, v_username, coalesce(v_display, ''));
  insert into public.user_settings (user_id) values (new.id);
  insert into public.user_scores (user_id) values (new.id);
  insert into public.user_presence (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Profile / settings RPCs
-- -----------------------------------------------------------------------------
create or replace function public.check_username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select lower(p_username) ~ '^[a-z0-9_.]{3,20}$'
     and lower(p_username) !~ '(^\.|\.$|\.\.)'
     and not private.is_reserved_username(lower(p_username))
     and not exists (
       select 1 from public.profiles
       where username = lower(p_username) and id is distinct from auth.uid()
     )
$$;

create or replace function public.set_username(p_username text)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_name text := lower(trim(p_username));
  v_row public.profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.check_username_available(v_name) then
    raise exception 'username_unavailable' using errcode = '23505';
  end if;
  update public.profiles set username = v_name where id = auth.uid() returning * into v_row;
  return v_row;
end $$;

create or replace function public.update_profile(
  p_display_name text default null,
  p_bio text default null,
  p_avatar_media_id uuid default null,
  p_cover_media_id uuid default null,
  p_is_private boolean default null,
  p_clear_avatar boolean default false,
  p_clear_cover boolean default false
) returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_row public.profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_avatar_media_id is not null and not exists (
       select 1 from public.media_assets
       where id = p_avatar_media_id and owner_id = auth.uid() and status = 'ready'
         and kind = 'image' and purpose = 'avatar') then
    raise exception 'invalid_media' using errcode = '22023';
  end if;
  if p_cover_media_id is not null and not exists (
       select 1 from public.media_assets
       where id = p_cover_media_id and owner_id = auth.uid() and status = 'ready'
         and kind = 'image' and purpose = 'cover') then
    raise exception 'invalid_media' using errcode = '22023';
  end if;

  update public.profiles set
    display_name    = coalesce(left(trim(p_display_name), 50), display_name),
    bio             = coalesce(left(p_bio, 300), bio),
    avatar_media_id = case when p_clear_avatar then null else coalesce(p_avatar_media_id, avatar_media_id) end,
    cover_media_id  = case when p_clear_cover then null else coalesce(p_cover_media_id, cover_media_id) end,
    is_private      = coalesce(p_is_private, is_private)
  where id = auth.uid()
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.complete_onboarding(p_username text, p_display_name text)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_row public.profiles;
  v_name text := lower(trim(p_username));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if char_length(trim(coalesce(p_display_name, ''))) = 0 then
    raise exception 'display_name_required' using errcode = '22023';
  end if;
  if v_name <> (select username from public.profiles where id = auth.uid()) then
    perform public.set_username(v_name);
  end if;
  update public.profiles
     set display_name = left(trim(p_display_name), 50), onboarded = true
   where id = auth.uid()
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.heartbeat()
returns void language sql security definer set search_path = '' as $$
  update public.user_presence set last_seen_at = now() where user_id = auth.uid();
$$;

-- Deactivation hides the account everywhere; logging in again reactivates it.
create or replace function public.set_account_active(p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.profiles
     set status = case when p_active then 'active' else 'deactivated' end
   where id = auth.uid() and status in ('active', 'deactivated');
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.user_settings      enable row level security;
alter table public.user_presence      enable row level security;
alter table public.user_scores        enable row level security;
alter table public.score_events       enable row level security;
alter table public.admin_roles        enable row level security;
alter table public.media_assets       enable row level security;
alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.user_sessions      enable row level security;
alter table public.app_settings       enable row level security;
alter table public.announcements      enable row level security;

-- Profiles: everyone signed-in can see active, non-blocked profiles.
-- (Policy for blocks added in the social migration once blocks exists.)
create policy profiles_select_self_or_admin on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy settings_select_own on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy settings_update_own on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy presence_select_own on public.user_presence for select to authenticated
  using (user_id = (select auth.uid()));

create policy scores_select_own_or_admin on public.score_events for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy admin_roles_select on public.admin_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin('admin')));

create policy media_select_own on public.media_assets for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));

create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

create policy push_select_own on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_delete_own on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy user_sessions_select_own on public.user_sessions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin('admin')));

create policy app_settings_select_public on public.app_settings for select to anon, authenticated
  using (is_public or (select private.is_admin()));

create policy announcements_select_active on public.announcements for select to anon, authenticated
  using ((active and starts_at <= now() and (ends_at is null or ends_at > now())) or (select private.is_admin()));

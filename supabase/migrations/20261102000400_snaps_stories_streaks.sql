-- =============================================================================
-- Quick Chat — snaps, stories, streaks, score.
--
-- Disappearing content is enforced here, not in the UI:
--   * RLS hides expired snaps/stories immediately (predicate on expires_at).
--   * Snap media is only served while a recipient's view window is open
--     (private.can_access_media checks snap_recipients.view_expires_at).
--   * private.run_maintenance (pg_cron + /api/cron/cleanup) marks media for
--     deletion; the cron route then deletes objects from storage.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Score rules (server-side only)
--   snap_sent     +1 per recipient, max 10 per recipient per day, 100/day total
--   snap_opened   +1 per snap opened,                              100/day total
--   story_posted  +2 per story,                                     10/day total
--   streak_day    +1 to both friends when a streak day is counted,  50/day total
-- -----------------------------------------------------------------------------
create or replace function private.utc_today()
returns date language sql stable as $$
  select (now() at time zone 'utc')::date
$$;

create or replace function private.award_score(p_user uuid, p_reason text, p_delta integer, p_ref uuid, p_daily_cap integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_today_total integer;
begin
  select coalesce(sum(delta), 0) into v_today_total
  from public.score_events
  where user_id = p_user and reason = p_reason
    and created_at >= (private.utc_today()::timestamp at time zone 'utc');
  if v_today_total + p_delta > p_daily_cap then
    return false;
  end if;
  insert into public.score_events (user_id, delta, reason, ref_id) values (p_user, p_delta, p_reason, p_ref);
  update public.user_scores set score = score + p_delta, updated_at = now() where user_id = p_user;
  return true;
end $$;

create or replace function public.score_history(p_limit integer default 50)
returns table (delta integer, reason text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select delta, reason, created_at from public.score_events
  where user_id = auth.uid()
  order by created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;

-- -----------------------------------------------------------------------------
-- Streaks
-- A "streak day" (UTC) counts when both friends send each other at least one
-- snap that day. Missing a full UTC day ends the streak: a streak last counted
-- on day D expires at the start of day D+2 (UTC).
-- Recovery: once per 30 days, within 48h of loss, for streaks of 3+ days.
-- -----------------------------------------------------------------------------
create table public.streaks (
  user_a            uuid not null references public.profiles (id) on delete cascade,
  user_b            uuid not null references public.profiles (id) on delete cascade,
  count             integer not null default 0 check (count >= 0),
  a_last_day        date,
  b_last_day        date,
  last_counted_day  date,
  started_on        date,
  lost_count        integer not null default 0,
  lost_at           timestamptz,
  last_recovered_at timestamptz,
  reminder_sent_day date,
  updated_at        timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index streaks_user_b on public.streaks (user_b);
create index streaks_active on public.streaks (last_counted_day) where count > 0;

create or replace function private.effective_streak(p_count integer, p_last_day date)
returns integer language sql stable as $$
  select case when p_last_day is not null and p_last_day >= private.utc_today() - 1 then p_count else 0 end
$$;

create or replace function private.streak_expires_at(p_last_day date)
returns timestamptz language sql immutable as $$
  select ((p_last_day + 2)::timestamp at time zone 'utc')
$$;

create or replace function private.streak_touch(p_sender uuid, p_recipient uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_today date := private.utc_today();
  s public.streaks;
begin
  insert into public.streaks (user_a, user_b)
  values (least(p_sender, p_recipient), greatest(p_sender, p_recipient))
  on conflict do nothing;
  select * into s from public.streaks
   where user_a = least(p_sender, p_recipient) and user_b = greatest(p_sender, p_recipient)
   for update;

  if p_sender = s.user_a then
    s.a_last_day := v_today;
  else
    s.b_last_day := v_today;
  end if;

  if s.a_last_day = v_today and s.b_last_day = v_today and s.last_counted_day is distinct from v_today then
    if s.last_counted_day = v_today - 1 then
      s.count := s.count + 1;
    else
      if s.count > 0 then
        s.lost_count := s.count;
        s.lost_at := private.streak_expires_at(s.last_counted_day);
      end if;
      s.count := 1;
      s.started_on := v_today;
    end if;
    s.last_counted_day := v_today;
    perform private.award_score(s.user_a, 'streak_day', 1, null, 50);
    perform private.award_score(s.user_b, 'streak_day', 1, null, 50);
  end if;

  update public.streaks set
    count = s.count, a_last_day = s.a_last_day, b_last_day = s.b_last_day,
    last_counted_day = s.last_counted_day, started_on = s.started_on,
    lost_count = s.lost_count, lost_at = s.lost_at, updated_at = now()
  where user_a = s.user_a and user_b = s.user_b;
end $$;

create or replace function public.recover_streak(p_other uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
  s public.streaks;
begin
  if not private.are_friends(v_me, p_other) then
    raise exception 'not_friends' using errcode = '42501';
  end if;
  select * into s from public.streaks
   where user_a = least(v_me, p_other) and user_b = greatest(v_me, p_other)
   for update;
  if s.user_a is null then
    raise exception 'streak_not_found' using errcode = 'P0002';
  end if;
  -- Treat a streak that has silently lapsed (maintenance not yet run) as lost.
  if s.count > 0 and private.effective_streak(s.count, s.last_counted_day) = 0 then
    s.lost_count := s.count;
    s.lost_at := private.streak_expires_at(s.last_counted_day);
    s.count := 0;
  end if;
  if s.count > 0 or s.lost_count < 3 or s.lost_at is null or s.lost_at < now() - interval '48 hours' then
    raise exception 'streak_not_recoverable' using errcode = '42501';
  end if;
  if s.last_recovered_at is not null and s.last_recovered_at > now() - interval '30 days' then
    raise exception 'recovery_cooldown' using errcode = '42501';
  end if;
  update public.streaks set
    count = s.lost_count, last_counted_day = private.utc_today() - 1,
    lost_count = 0, lost_at = null, last_recovered_at = now(), updated_at = now()
  where user_a = s.user_a and user_b = s.user_b;
  return s.lost_count;
end $$;

create or replace function public.my_streaks()
returns table (
  friend_id uuid, username text, display_name text, avatar_media_id uuid,
  count integer, expires_at timestamptz, i_sent_today boolean, they_sent_today boolean,
  recoverable boolean, lost_count integer
) language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_media_id,
         private.effective_streak(s.count, s.last_counted_day),
         case when private.effective_streak(s.count, s.last_counted_day) > 0
              then private.streak_expires_at(s.last_counted_day) end,
         case when s.user_a = auth.uid() then s.a_last_day else s.b_last_day end = private.utc_today(),
         case when s.user_a = auth.uid() then s.b_last_day else s.a_last_day end = private.utc_today(),
         (private.effective_streak(s.count, s.last_counted_day) = 0
           and greatest(s.lost_count, case when s.count > 0 then s.count else 0 end) >= 3
           and coalesce(s.lost_at, private.streak_expires_at(s.last_counted_day)) > now() - interval '48 hours'
           and (s.last_recovered_at is null or s.last_recovered_at < now() - interval '30 days')),
         greatest(s.lost_count, case when private.effective_streak(s.count, s.last_counted_day) = 0 then s.count else 0 end)
  from public.streaks s
  join public.profiles p on p.id = case when s.user_a = auth.uid() then s.user_b else s.user_a end
  where (s.user_a = auth.uid() or s.user_b = auth.uid()) and p.status = 'active'
    and private.are_friends(s.user_a, s.user_b)
  order by 5 desc, p.username
$$;

create or replace function public.my_friends()
returns table (id uuid, username text, display_name text, avatar_media_id uuid, friends_since timestamptz,
               last_seen_at timestamptz, streak_count integer)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_media_id, f.created_at,
         case when private.can_see_presence(p.id, auth.uid()) then pr.last_seen_at end,
         coalesce((select private.effective_streak(s.count, s.last_counted_day)
                   from public.streaks s where s.user_a = f.user_a and s.user_b = f.user_b), 0)
  from public.friendships f
  join public.profiles p on p.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  left join public.user_presence pr on pr.user_id = p.id
  where (f.user_a = auth.uid() or f.user_b = auth.uid()) and p.status = 'active'
  order by lower(p.display_name), p.username
$$;

-- -----------------------------------------------------------------------------
-- Snaps
-- -----------------------------------------------------------------------------
create table public.snaps (
  id               uuid primary key default gen_random_uuid(),
  sender_id        uuid not null references public.profiles (id) on delete cascade,
  media_id         uuid unique references public.media_assets (id) on delete set null,
  media_kind       text not null check (media_kind in ('image', 'video')),
  caption          text not null default '' check (char_length(caption) <= 250),
  overlays         jsonb not null default '[]'::jsonb,
  duration_seconds integer check (duration_seconds between 1 and 30),
  view_once        boolean not null default true,
  allow_replay     boolean not null default false,
  expires_at       timestamptz not null,
  media_deleted_at timestamptz,
  created_at       timestamptz not null default now()
);
create index snaps_sender_time on public.snaps (sender_id, created_at desc);
create index snaps_media_live on public.snaps (expires_at) where media_deleted_at is null;

create table public.snap_recipients (
  snap_id         uuid not null references public.snaps (id) on delete cascade,
  recipient_id    uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'delivered' check (status in ('delivered', 'opened', 'expired')),
  delivered_at    timestamptz not null default now(),
  opened_at       timestamptz,
  view_expires_at timestamptz,
  replay_count    integer not null default 0,
  screenshot_at   timestamptz,
  primary key (snap_id, recipient_id)
);
create index snap_recipients_inbox on public.snap_recipients (recipient_id, delivered_at desc);

create or replace function private.snap_sender(p_snap_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select sender_id from public.snaps where id = p_snap_id
$$;

create or replace function public.send_snap(
  p_media_id uuid, p_recipient_ids uuid[], p_duration_seconds integer default 10,
  p_view_once boolean default true, p_allow_replay boolean default false,
  p_caption text default '', p_overlays jsonb default '[]'::jsonb, p_expire_hours integer default 24
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me    uuid := private.require_user();
  v_media public.media_assets;
  v_id    uuid;
  v_name  text;
  v_count integer;
  r uuid;
begin
  select * into v_media from public.media_assets
   where id = p_media_id and owner_id = v_me and status = 'ready' and purpose = 'snap' and kind in ('image', 'video');
  if v_media.id is null or exists (select 1 from public.snaps where media_id = p_media_id) then
    raise exception 'invalid_media' using errcode = '22023';
  end if;
  select count(distinct x) into v_count from unnest(p_recipient_ids) x where x <> v_me;
  if v_count < 1 or v_count > 50 then
    raise exception 'invalid_recipients' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_recipient_ids) x
             where x <> v_me and (not private.are_friends(v_me, x) or not private.is_active_user(x))) then
    raise exception 'recipients_must_be_friends' using errcode = '42501';
  end if;
  if p_expire_hours not in (1, 6, 24, 72, 168) then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;
  if pg_column_size(coalesce(p_overlays, '[]'::jsonb)) > 16384 then
    raise exception 'overlays_too_large' using errcode = '22023';
  end if;
  if (select count(*) from public.snaps where sender_id = v_me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.snaps (sender_id, media_id, media_kind, caption, overlays, duration_seconds,
                            view_once, allow_replay, expires_at)
  values (v_me, p_media_id, v_media.kind, left(coalesce(p_caption, ''), 250), coalesce(p_overlays, '[]'::jsonb),
          case when v_media.kind = 'image' then coalesce(p_duration_seconds, 10) else null end,
          p_view_once, case when p_view_once then false else p_allow_replay end,
          now() + make_interval(hours => p_expire_hours))
  returning id into v_id;

  select username into v_name from public.profiles where id = v_me;
  for r in select distinct x from unnest(p_recipient_ids) x where x <> v_me loop
    -- Per-pair cap counted before inserting this snap.
    if (select count(*) from public.snap_recipients sr join public.snaps s on s.id = sr.snap_id
        where s.sender_id = v_me and sr.recipient_id = r
          and sr.delivered_at >= (private.utc_today()::timestamp at time zone 'utc')) < 10 then
      perform private.award_score(v_me, 'snap_sent', 1, v_id, 100);
    end if;
    insert into public.snap_recipients (snap_id, recipient_id) values (v_id, r);
    perform private.streak_touch(v_me, r);
    perform private.notify(r, 'snap', v_me, 'New Snap', '@' || v_name || ' sent you a Snap',
      jsonb_build_object('url', '/snaps?open=' || v_id), 'snap', v_id, 'snap:' || v_id);
  end loop;
  return v_id;
end $$;

-- Opens (or replays) a snap. Returns the view window; the API then issues a
-- signed media URL that expires with the window.
create or replace function public.open_snap(p_snap_id uuid, p_replay boolean default false)
returns table (snap_id uuid, media_id uuid, media_kind text, duration_seconds integer, overlays jsonb,
               caption text, view_expires_at timestamptz, sender_id uuid, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_me   uuid := private.require_user();
  v_snap public.snaps;
  v_rec  public.snap_recipients;
  v_len  interval;
  v_replayed boolean := false;
begin
  select * into v_snap from public.snaps where id = p_snap_id;
  select * into v_rec from public.snap_recipients
   where snap_recipients.snap_id = p_snap_id and recipient_id = v_me
   for update;
  if v_snap.id is null or v_rec.snap_id is null or v_snap.media_id is null or v_snap.media_deleted_at is not null
     or private.is_blocked(v_me, v_snap.sender_id) then
    raise exception 'snap_not_found' using errcode = 'P0002';
  end if;

  v_len := case
    when v_snap.media_kind = 'video'
      then make_interval(secs => least(coalesce((select duration_ms from public.media_assets where id = v_snap.media_id), 60000), 60000) / 1000.0)
    else make_interval(secs => coalesce(v_snap.duration_seconds, 10))
  end + interval '15 seconds';

  if v_rec.opened_at is null then
    if v_snap.expires_at <= now() then
      raise exception 'snap_expired' using errcode = 'P0002';
    end if;
    update public.snap_recipients
       set status = 'opened', opened_at = now(), view_expires_at = now() + v_len
     where snap_recipients.snap_id = p_snap_id and recipient_id = v_me
    returning * into v_rec;
    perform private.award_score(v_me, 'snap_opened', 1, p_snap_id, 100);
  elsif v_rec.view_expires_at > now() then
    null; -- still inside the current view window (e.g. page reload)
  elsif p_replay and v_snap.allow_replay and v_rec.replay_count < 1 and v_rec.opened_at > now() - interval '24 hours' then
    update public.snap_recipients
       set replay_count = replay_count + 1, view_expires_at = now() + v_len
     where snap_recipients.snap_id = p_snap_id and recipient_id = v_me
    returning * into v_rec;
    v_replayed := true;
  else
    raise exception 'snap_already_viewed' using errcode = '42501';
  end if;

  update public.notifications set read_at = now()
   where user_id = v_me and dedupe_key = 'snap:' || p_snap_id and read_at is null;

  return query select v_snap.id, v_snap.media_id, v_snap.media_kind, v_snap.duration_seconds, v_snap.overlays,
                      v_snap.caption, v_rec.view_expires_at, v_snap.sender_id, v_replayed;
end $$;

-- Browsers cannot reliably detect screenshots; the client reports what it can
-- (e.g. some mobile browsers / visibility heuristics). Best-effort only.
create or replace function public.report_snap_screenshot(p_snap_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
  v_sender uuid := private.snap_sender(p_snap_id);
  v_name text;
begin
  update public.snap_recipients set screenshot_at = now()
   where snap_id = p_snap_id and recipient_id = v_me and opened_at is not null and screenshot_at is null;
  if found then
    select username into v_name from public.profiles where id = v_me;
    perform private.notify(v_sender, 'snap_screenshot', v_me, 'Screenshot',
      '@' || v_name || ' may have taken a screenshot of your Snap',
      jsonb_build_object('url', '/snaps?tab=sent'), 'snap', p_snap_id, 'ss:' || p_snap_id || ':' || v_me);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Stories
-- -----------------------------------------------------------------------------
create table public.stories (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  media_id       uuid references public.media_assets (id) on delete set null,
  media_kind     text not null check (media_kind in ('image', 'video')),
  caption        text not null default '' check (char_length(caption) <= 250),
  overlays       jsonb not null default '[]'::jsonb,
  audience       text not null default 'friends' check (audience in ('public', 'friends', 'custom')),
  view_count     integer not null default 0,
  reaction_count integer not null default 0,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '24 hours',
  deleted_at     timestamptz,
  removed_at     timestamptz
);
create index stories_user_active on public.stories (user_id, created_at desc) where deleted_at is null;
create index stories_expiry on public.stories (expires_at) where deleted_at is null;
create index stories_public on public.stories (created_at desc) where audience = 'public' and deleted_at is null;
create index stories_caption_trgm on public.stories using gin (caption extensions.gin_trgm_ops);

create table public.story_audience (
  story_id uuid not null references public.stories (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (story_id, user_id)
);
create index story_audience_user on public.story_audience (user_id);

create table public.story_views (
  story_id  uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create index story_views_viewer on public.story_views (viewer_id);

create table public.story_reactions (
  story_id   uuid not null references public.stories (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create or replace function private.can_view_story(p_story_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.stories s
    join public.profiles a on a.id = s.user_id
    where s.id = p_story_id
      and s.deleted_at is null and s.removed_at is null and s.expires_at > now()
      and (
        s.user_id = p_user
        or (
          a.status = 'active'
          and not private.is_blocked(s.user_id, p_user)
          and case s.audience
                when 'public'  then not a.is_private
                                    or private.are_friends(s.user_id, p_user)
                                    or exists (select 1 from public.follows f
                                               where f.follower_id = p_user and f.followee_id = s.user_id)
                when 'friends' then private.are_friends(s.user_id, p_user)
                when 'custom'  then exists (select 1 from public.story_audience sa
                                            where sa.story_id = s.id and sa.user_id = p_user)
                else false
              end
        )
      )
  )
$$;

create or replace function public.post_story(
  p_media_id uuid, p_caption text default '', p_overlays jsonb default '[]'::jsonb,
  p_audience text default 'friends', p_custom_ids uuid[] default null, p_friend_list_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me    uuid := private.require_user();
  v_media public.media_assets;
  v_id    uuid;
begin
  select * into v_media from public.media_assets
   where id = p_media_id and owner_id = v_me and status = 'ready' and purpose = 'story' and kind in ('image', 'video');
  if v_media.id is null or exists (select 1 from public.stories where media_id = p_media_id) then
    raise exception 'invalid_media' using errcode = '22023';
  end if;
  if p_audience not in ('public', 'friends', 'custom') then
    raise exception 'invalid_audience' using errcode = '22023';
  end if;
  if pg_column_size(coalesce(p_overlays, '[]'::jsonb)) > 16384 then
    raise exception 'overlays_too_large' using errcode = '22023';
  end if;
  if (select count(*) from public.stories where user_id = v_me and created_at > now() - interval '1 day') >= 100 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.stories (user_id, media_id, media_kind, caption, overlays, audience)
  values (v_me, p_media_id, v_media.kind, left(coalesce(p_caption, ''), 250), coalesce(p_overlays, '[]'::jsonb), p_audience)
  returning id into v_id;

  if p_audience = 'custom' then
    insert into public.story_audience (story_id, user_id)
    select v_id, x from (
      select unnest(coalesce(p_custom_ids, '{}')) as x
      union
      select m.user_id from public.friend_list_members m
      join public.friend_lists l on l.id = m.list_id
      where l.id = p_friend_list_id and l.owner_id = v_me
    ) t
    where private.are_friends(v_me, x)
    on conflict do nothing;
    if not exists (select 1 from public.story_audience where story_id = v_id) then
      raise exception 'empty_audience' using errcode = '22023';
    end if;
  end if;

  perform private.award_score(v_me, 'story_posted', 2, v_id, 10);
  return v_id;
end $$;

create or replace function public.delete_story(p_story_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_media uuid;
begin
  update public.stories set deleted_at = now()
   where id = p_story_id and user_id = auth.uid() and deleted_at is null
  returning media_id into v_media;
  if not found then
    raise exception 'story_not_found' using errcode = 'P0002';
  end if;
  update public.media_assets set status = 'pending_delete', delete_after = now() where id = v_media;
end $$;

create or replace function public.record_story_view(p_story_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  if not private.can_view_story(p_story_id, v_me) then
    raise exception 'story_not_found' using errcode = 'P0002';
  end if;
  if (select user_id from public.stories where id = p_story_id) = v_me then
    return;
  end if;
  insert into public.story_views (story_id, viewer_id) values (p_story_id, v_me) on conflict do nothing;
  if found then
    update public.stories set view_count = view_count + 1 where id = p_story_id;
  end if;
end $$;

create or replace function public.react_to_story(p_story_id uuid, p_emoji text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me    uuid := private.require_user();
  v_owner uuid;
  v_name  text;
  v_new   boolean;
begin
  if not private.can_view_story(p_story_id, v_me) then
    raise exception 'story_not_found' using errcode = 'P0002';
  end if;
  select user_id into v_owner from public.stories where id = p_story_id;
  if v_owner = v_me then
    raise exception 'cannot_react_own_story' using errcode = '22023';
  end if;
  if p_emoji is null then
    delete from public.story_reactions where story_id = p_story_id and user_id = v_me;
    if found then
      update public.stories set reaction_count = greatest(reaction_count - 1, 0) where id = p_story_id;
    end if;
    return;
  end if;
  if char_length(p_emoji) > 16 then
    raise exception 'invalid_emoji' using errcode = '22023';
  end if;
  v_new := not exists (select 1 from public.story_reactions where story_id = p_story_id and user_id = v_me);
  insert into public.story_reactions (story_id, user_id, emoji) values (p_story_id, v_me, p_emoji)
  on conflict (story_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  if v_new then
    update public.stories set reaction_count = reaction_count + 1 where id = p_story_id;
  end if;
  select username into v_name from public.profiles where id = v_me;
  perform private.notify(v_owner, 'story_reaction', v_me, 'Story reaction',
    '@' || v_name || ' reacted ' || p_emoji || ' to your story',
    jsonb_build_object('url', '/stories?view=' || p_story_id), 'story', p_story_id,
    'sr:' || p_story_id || ':' || v_me, true);
end $$;

create or replace function public.story_viewers(p_story_id uuid)
returns table (viewer_id uuid, username text, display_name text, avatar_media_id uuid, viewed_at timestamptz, emoji text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_media_id, v.viewed_at, r.emoji
  from public.story_views v
  join public.stories s on s.id = v.story_id
  join public.profiles p on p.id = v.viewer_id
  left join public.story_reactions r on r.story_id = v.story_id and r.user_id = v.viewer_id
  where v.story_id = p_story_id and s.user_id = auth.uid()
  order by v.viewed_at desc
$$;

-- Story carousel: one row per author with visible active stories.
create or replace function public.stories_feed()
returns table (user_id uuid, username text, display_name text, avatar_media_id uuid,
               story_count bigint, latest_at timestamptz, has_unseen boolean, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_media_id,
         count(*), max(s.created_at),
         bool_or(not exists (select 1 from public.story_views v where v.story_id = s.id and v.viewer_id = auth.uid())
                 and s.user_id <> auth.uid()),
         p.id = auth.uid()
  from public.stories s
  join public.profiles p on p.id = s.user_id
  where s.deleted_at is null and s.removed_at is null and s.expires_at > now()
    and (s.user_id = auth.uid()
         or s.user_id in (select private.friend_ids(auth.uid()))
         or s.user_id in (select followee_id from public.follows where follower_id = auth.uid()))
    and private.can_view_story(s.id, auth.uid())
  group by p.id, p.username, p.display_name, p.avatar_media_id
  order by (p.id = auth.uid()) desc, 7 desc, 6 desc
  limit 200
$$;

create or replace function public.user_stories(p_user_id uuid)
returns table (id uuid, media_id uuid, media_kind text, caption text, overlays jsonb, audience text,
               created_at timestamptz, expires_at timestamptz, viewed boolean, my_reaction text,
               view_count integer, reaction_count integer)
language sql stable security definer set search_path = '' as $$
  select s.id, s.media_id, s.media_kind, s.caption, s.overlays, s.audience, s.created_at, s.expires_at,
         exists (select 1 from public.story_views v where v.story_id = s.id and v.viewer_id = auth.uid()),
         (select emoji from public.story_reactions r where r.story_id = s.id and r.user_id = auth.uid()),
         case when s.user_id = auth.uid() then s.view_count end,
         case when s.user_id = auth.uid() then s.reaction_count end
  from public.stories s
  where s.user_id = p_user_id and private.can_view_story(s.id, auth.uid())
  order by s.created_at asc
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.streaks         enable row level security;
alter table public.snaps           enable row level security;
alter table public.snap_recipients enable row level security;
alter table public.stories         enable row level security;
alter table public.story_audience  enable row level security;
alter table public.story_views     enable row level security;
alter table public.story_reactions enable row level security;

create policy streaks_select_own on public.streaks for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));

create policy snaps_select on public.snaps for select to authenticated
  using (
    sender_id = (select auth.uid())
    or exists (
      select 1 from public.snap_recipients r
      where r.snap_id = snaps.id and r.recipient_id = (select auth.uid())
        and (r.opened_at is not null or snaps.expires_at > now()))
  );

create policy snap_recipients_select on public.snap_recipients for select to authenticated
  using (recipient_id = (select auth.uid()) or private.snap_sender(snap_id) = (select auth.uid()));

create policy stories_select on public.stories for select to authenticated
  using (private.can_view_story(id, (select auth.uid())) or (select private.is_admin()));

create policy story_audience_select_owner on public.story_audience for select to authenticated
  using (exists (select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid())));

create policy story_views_select on public.story_views for select to authenticated
  using (viewer_id = (select auth.uid())
         or exists (select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid())));

create policy story_reactions_select on public.story_reactions for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid())));

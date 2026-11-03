-- =============================================================================
-- Quick Chat — "Who viewed your profile".
--   * profile_views: one row per (viewer, profile) per dedupe window (default
--     24h, app_settings.profile_view_window_hours). Never readable directly:
--     my_profile_views masks anonymous viewers, so their ids never leave the DB.
--   * Settings: track views of my profile (on/off) and how I appear when I
--     view others (identifiable / anonymous). Online status keeps using
--     last_active_visibility.
--   * In-app notification "@username viewed your profile" or, for anonymous
--     viewers, "Someone viewed your profile".
-- Additive.
-- =============================================================================

alter table public.user_settings
  add column profile_view_tracking boolean not null default true,
  add column profile_view_mode text not null default 'identifiable'
    check (profile_view_mode in ('identifiable', 'anonymous'));
grant update (profile_view_tracking, profile_view_mode) on public.user_settings to authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'message', 'friend_request', 'friend_accepted', 'incoming_call', 'missed_call',
  'snap', 'snap_opened', 'snap_screenshot', 'story_reaction', 'story_reply',
  'streak_reminder', 'mention', 'group_invite', 'security', 'system',
  'post_like', 'post_comment', 'follow', 'moderation', 'profile_view'));

insert into public.app_settings (key, value, is_public)
values ('profile_view_window_hours', '24', false)
on conflict (key) do nothing;

create table public.profile_views (
  id               uuid primary key default gen_random_uuid(),
  profile_owner_id uuid not null references public.profiles (id) on delete cascade,
  viewer_user_id   uuid not null references public.profiles (id) on delete cascade,
  viewed_at        timestamptz not null default now(),
  visibility_mode  text not null check (visibility_mode in ('identifiable', 'anonymous')),
  check (profile_owner_id <> viewer_user_id)
);
create index profile_views_owner_time on public.profile_views (profile_owner_id, viewed_at desc);
create index profile_views_dedupe on public.profile_views (viewer_user_id, profile_owner_id, viewed_at desc);

-- No policies: rows (which name anonymous viewers) are only reachable through
-- the security-definer functions below.
alter table public.profile_views enable row level security;
revoke all on public.profile_views from anon, authenticated;

-- Records a visit. Returns true when a new view was stored.
create or replace function public.record_profile_view(p_profile_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_me     uuid := private.require_user();
  v_window integer;
  v_mode   text;
  v_name   text;
begin
  if p_profile_id is null or p_profile_id = v_me then
    return false;
  end if;
  if not exists (select 1 from public.profiles p
                 where p.id = p_profile_id and p.status = 'active' and not private.is_blocked(p.id, v_me)) then
    return false;
  end if;
  if not coalesce((select s.profile_view_tracking from public.user_settings s where s.user_id = p_profile_id), true) then
    return false;
  end if;

  select greatest(1, least(720, coalesce((value #>> '{}')::integer, 24))) into v_window
    from public.app_settings where key = 'profile_view_window_hours';
  v_window := coalesce(v_window, 24);
  if exists (select 1 from public.profile_views v
             where v.viewer_user_id = v_me and v.profile_owner_id = p_profile_id
               and v.viewed_at > now() - make_interval(hours => v_window)) then
    return false;
  end if;

  v_mode := coalesce((select s.profile_view_mode from public.user_settings s where s.user_id = v_me), 'identifiable');
  insert into public.profile_views (profile_owner_id, viewer_user_id, visibility_mode)
  values (p_profile_id, v_me, v_mode);

  if v_mode = 'anonymous' then
    -- One rolling notification for anonymous views; no actor, so nothing identifies the viewer.
    perform private.notify(p_profile_id, 'profile_view', null, 'Profile view', 'Someone viewed your profile',
      jsonb_build_object('url', '/profile-views'), 'profile', p_profile_id, 'pv:anonymous', true);
  else
    select username into v_name from public.profiles where id = v_me;
    perform private.notify(p_profile_id, 'profile_view', v_me, 'Profile view', '@' || v_name || ' viewed your profile',
      jsonb_build_object('url', '/profile/' || v_name), 'profile', v_me, 'pv:' || v_me, true);
  end if;
  return true;
end $$;

-- The caller's visitors, newest first. Anonymous visits carry no identity;
-- visits from people either side has blocked, or inactive accounts, are hidden.
create or replace function public.my_profile_views(p_limit integer default 50, p_before timestamptz default null)
returns table (view_id uuid, viewed_at timestamptz, anonymous boolean,
               id uuid, username text, display_name text, avatar_media_id uuid, is_verified boolean,
               last_seen_at timestamptz, is_friend boolean)
language sql stable security definer set search_path = '' as $$
  select v.id, v.viewed_at, v.visibility_mode = 'anonymous',
         case when v.visibility_mode = 'identifiable' then p.id end,
         case when v.visibility_mode = 'identifiable' then p.username end,
         case when v.visibility_mode = 'identifiable' then p.display_name end,
         case when v.visibility_mode = 'identifiable' and private.profile_media_visible(p.id, auth.uid(), 'avatar') then p.avatar_media_id end,
         case when v.visibility_mode = 'identifiable' then p.is_verified end,
         case when v.visibility_mode = 'identifiable' and private.can_see_presence(p.id, auth.uid())
              then (select pr.last_seen_at from public.user_presence pr where pr.user_id = p.id) end,
         case when v.visibility_mode = 'identifiable' then private.are_friends(p.id, auth.uid()) end
  from public.profile_views v
  join public.profiles p on p.id = v.viewer_user_id
  where v.profile_owner_id = auth.uid()
    and p.status = 'active'
    and not private.is_blocked(p.id, auth.uid())
    and (p_before is null or v.viewed_at < p_before)
  order by v.viewed_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

create or replace function public.my_profile_view_stats()
returns table (unique_visitors bigint, unique_visitors_7d bigint, total_views bigint)
language sql stable security definer set search_path = '' as $$
  select count(distinct v.viewer_user_id),
         count(distinct v.viewer_user_id) filter (where v.viewed_at > now() - interval '7 days'),
         count(*)
  from public.profile_views v
  join public.profiles p on p.id = v.viewer_user_id
  where v.profile_owner_id = auth.uid() and p.status = 'active' and not private.is_blocked(p.id, auth.uid())
$$;

revoke execute on function public.record_profile_view(uuid) from public, anon;
revoke execute on function public.my_profile_views(integer, timestamptz) from public, anon;
revoke execute on function public.my_profile_view_stats() from public, anon;
grant execute on function public.record_profile_view(uuid) to authenticated, service_role;
grant execute on function public.my_profile_views(integer, timestamptz) to authenticated, service_role;
grant execute on function public.my_profile_view_stats() to authenticated, service_role;

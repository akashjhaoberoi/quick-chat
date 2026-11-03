-- =============================================================================
-- Quick Chat — media protection.
--   * Profile / cover photo visibility (everyone, friends, only me), enforced in
--     private.can_access_media and profile_summary.
--   * Chat media modes: normal, view_once, disappearing (24h), protected.
--     View-once media is served only inside a server-side view window.
--   * Screenshot reports for protected chat media, media access log, security
--     events, and a maintenance job that deletes spent view-once media.
-- Additive: new columns have defaults that keep today's behaviour.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------
alter table public.user_settings
  add column avatar_visibility text not null default 'everyone'
    check (avatar_visibility in ('everyone', 'friends', 'nobody')),
  add column cover_visibility text not null default 'everyone'
    check (cover_visibility in ('everyone', 'friends', 'nobody')),
  add column media_watermark boolean not null default true,
  add column default_media_mode text not null default 'normal'
    check (default_media_mode in ('normal', 'view_once', 'disappearing', 'protected'));

grant update (avatar_visibility, cover_visibility, media_watermark, default_media_mode)
  on public.user_settings to authenticated;

-- -----------------------------------------------------------------------------
-- Messages: per-message media mode + view-once views
-- -----------------------------------------------------------------------------
alter table public.messages
  add column media_mode text not null default 'normal'
    check (media_mode in ('normal', 'view_once', 'disappearing', 'protected'));
create index messages_view_once on public.messages (created_at) where media_mode = 'view_once';

create table public.message_media_views (
  message_id      uuid not null references public.messages (id) on delete cascade,
  viewer_id       uuid not null references public.profiles (id) on delete cascade,
  opened_at       timestamptz not null default now(),
  view_expires_at timestamptz not null,
  screenshot_at   timestamptz,
  primary key (message_id, viewer_id)
);

-- Screenshot-related reports (best effort: only what a browser can observe).
create table public.media_security_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  owner_id    uuid references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('screenshot_shortcut')),
  target_type text not null check (target_type in ('message', 'snap', 'profile')),
  target_id   uuid not null,
  created_at  timestamptz not null default now()
);
create index media_security_events_owner on public.media_security_events (owner_id, created_at desc);
create index media_security_events_target on public.media_security_events (target_id, user_id, created_at desc);

-- Who fetched protected media (written by the API with the service role).
create table public.media_access_log (
  id          bigint generated always as identity primary key,
  media_id    uuid not null,
  viewer_id   uuid not null,
  purpose     text not null,
  mode        text not null,
  accessed_at timestamptz not null default now()
);
create index media_access_log_media on public.media_access_log (media_id, accessed_at desc);
create index media_access_log_time on public.media_access_log (accessed_at);

alter table public.message_media_views   enable row level security;
alter table public.media_security_events enable row level security;
alter table public.media_access_log      enable row level security;

create policy message_media_views_select on public.message_media_views for select to authenticated
  using (viewer_id = (select auth.uid())
         or exists (select 1 from public.messages msg where msg.id = message_id and msg.sender_id = (select auth.uid())));
create policy media_security_events_select on public.media_security_events for select to authenticated
  using (user_id = (select auth.uid()) or owner_id = (select auth.uid()) or (select private.is_admin()));
-- media_access_log: no policies — service role only.

revoke all on public.message_media_views, public.media_security_events, public.media_access_log from anon;
revoke insert, update, delete, truncate on public.message_media_views, public.media_security_events, public.media_access_log
  from authenticated;
revoke select on public.media_access_log from authenticated;

-- -----------------------------------------------------------------------------
-- Profile / cover photo visibility
-- -----------------------------------------------------------------------------
create or replace function private.profile_media_visible(p_owner uuid, p_viewer uuid, p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = p_viewer
      or private.is_admin('moderator', p_viewer)
      or exists (
        select 1 from public.profiles p
        left join public.user_settings s on s.user_id = p.id
        where p.id = p_owner and p.status = 'active' and not private.is_blocked(p.id, p_viewer)
          and case coalesce(case when p_kind = 'avatar' then s.avatar_visibility else s.cover_visibility end, 'everyone')
                -- A private account's cover was already friends-only; keep that.
                when 'everyone' then p_kind = 'avatar' or not p.is_private or private.are_friends(p.id, p_viewer)
                when 'friends' then private.are_friends(p.id, p_viewer)
                else false
              end)
$$;

-- -----------------------------------------------------------------------------
-- Media access (replaces the version from 000700)
-- -----------------------------------------------------------------------------
create or replace function private.can_access_media(p_media_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.media_assets m
    where m.id = p_media_id and m.status = 'ready'
      and (
        (m.owner_id = p_user)
        or (m.purpose in ('avatar', 'cover') and exists (
              select 1 from public.profiles p
              where ((m.purpose = 'avatar' and p.avatar_media_id = m.id) or (m.purpose = 'cover' and p.cover_media_id = m.id))
                and private.profile_media_visible(p.id, p_user, m.purpose)))
        or (m.purpose = 'group_avatar' and exists (
              select 1 from public.groups g where g.avatar_media_id = m.id and private.is_member(g.conversation_id, p_user)))
        or (m.purpose = 'message' and exists (
              select 1 from public.message_attachments a join public.messages msg on msg.id = a.message_id
              where a.media_id = m.id and msg.deleted_at is null and private.can_read_message(msg, p_user)
                and (msg.media_mode <> 'view_once' or msg.sender_id = p_user or exists (
                      select 1 from public.message_media_views v
                      where v.message_id = msg.id and v.viewer_id = p_user and v.view_expires_at > now()))))
        or (m.purpose = 'snap' and exists (
              select 1 from public.snaps s join public.snap_recipients r on r.snap_id = s.id
              where s.media_id = m.id and s.media_deleted_at is null
                and r.recipient_id = p_user and r.view_expires_at > now()))
        or (m.purpose = 'story' and exists (
              select 1 from public.stories s where s.media_id = m.id and private.can_view_story(s.id, p_user)))
        or (m.purpose = 'post' and exists (
              select 1 from public.posts p where p.media_id = m.id
                and (private.can_view_post(p.id, p_user) or private.is_admin('moderator', p_user))))
        or (private.is_admin('moderator', p_user) and exists (
              select 1 from public.reports r
              where r.status in ('pending', 'reviewing') and r.snapshot -> 'media_ids' ? m.id::text))
      )
  )
$$;

-- profile_summary gains visibility-filtered photo ids and the owner's watermark
-- preference; the return type changes, so it is dropped and recreated.
drop function public.profile_summary(text);
create function public.profile_summary(p_username text)
returns table (id uuid, username text, display_name text, bio text, avatar_media_id uuid, cover_media_id uuid,
               is_private boolean, is_creator boolean, is_verified boolean, created_at timestamptz,
               score bigint, friend_count bigint, follower_count bigint, following_count bigint, post_count bigint,
               is_friend boolean, is_following boolean, request_status text, request_id uuid, mutual_count bigint,
               last_seen_at timestamptz, can_view_details boolean, media_watermark boolean)
language sql stable security definer set search_path = '' as $$
  with t as (
    select p.* from public.profiles p
    where p.username = lower(p_username)
      and (p.id = auth.uid() or (p.status = 'active' and not private.is_blocked(p.id, auth.uid())))
  ), rel as (
    select t.id, private.are_friends(t.id, auth.uid()) as friend,
           t.id = auth.uid() or not t.is_private or private.are_friends(t.id, auth.uid()) as details
    from t
  )
  select t.id, t.username, t.display_name, t.bio,
         case when private.profile_media_visible(t.id, auth.uid(), 'avatar') then t.avatar_media_id end,
         case when rel.details and private.profile_media_visible(t.id, auth.uid(), 'cover') then t.cover_media_id end,
         t.is_private, t.is_creator, t.is_verified, t.created_at,
         case when t.id = auth.uid() or private.score_is_public(t.id) then (select score from public.user_scores where user_id = t.id) end,
         case when rel.details then (select count(*) from public.friendships f where f.user_a = t.id or f.user_b = t.id) end,
         (select count(*) from public.follows f where f.followee_id = t.id),
         (select count(*) from public.follows f where f.follower_id = t.id),
         case when rel.details then (select count(*) from public.posts p where p.author_id = t.id and p.status = 'active') end,
         rel.friend,
         exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = t.id),
         (select case when fr.sender_id = auth.uid() then 'outgoing' else 'incoming' end
            from public.friend_requests fr
           where fr.status = 'pending'
             and ((fr.sender_id = auth.uid() and fr.receiver_id = t.id) or (fr.sender_id = t.id and fr.receiver_id = auth.uid()))),
         (select fr.id from public.friend_requests fr
           where fr.status = 'pending'
             and ((fr.sender_id = auth.uid() and fr.receiver_id = t.id) or (fr.sender_id = t.id and fr.receiver_id = auth.uid()))),
         (select count(*) from private.friend_ids(t.id) a where a in (select private.friend_ids(auth.uid()))),
         case when private.can_see_presence(t.id, auth.uid()) then (select last_seen_at from public.user_presence where user_id = t.id) end,
         rel.details,
         coalesce((select s.media_watermark from public.user_settings s where s.user_id = t.id), true)
  from t join rel on rel.id = t.id
$$;

-- -----------------------------------------------------------------------------
-- Sending: post_message / send_message gain the media mode
-- -----------------------------------------------------------------------------
drop function private.post_message(uuid, uuid, text, text, jsonb, uuid, text, uuid[], boolean);
create function private.post_message(
  p_sender uuid, p_conversation uuid, p_type text, p_body text, p_metadata jsonb,
  p_reply_to uuid, p_client_id text, p_media_ids uuid[], p_forwarded boolean default false,
  p_media_mode text default 'normal'
) returns public.messages language plpgsql security definer set search_path = '' as $$
declare
  v_conv    public.conversations;
  v_role    text;
  v_group   public.groups;
  v_other   uuid;
  v_msg     public.messages;
  v_expires timestamptz;
  v_title   text;
  v_sender  public.profiles;
  r         record;
begin
  if p_client_id is not null then
    select * into v_msg from public.messages where sender_id = p_sender and client_id = p_client_id;
    if found then
      return v_msg;
    end if;
  end if;

  select * into v_conv from public.conversations where id = p_conversation;
  v_role := private.member_role(p_conversation, p_sender);
  if v_conv.id is null or v_role is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  if p_type <> 'system' then
    if v_conv.type = 'direct' then
      select user_id into v_other from public.conversation_members
       where conversation_id = p_conversation and user_id <> p_sender;
      if v_other is null or not private.can_message_direct(p_sender, v_other) then
        raise exception 'cannot_message_user' using errcode = '42501';
      end if;
    else
      select * into v_group from public.groups where conversation_id = p_conversation;
      if v_group.only_admins_send and v_role = 'member' then
        raise exception 'only_admins_can_send' using errcode = '42501';
      end if;
    end if;

    if (select count(*) from public.messages
        where sender_id = p_sender and created_at > now() - interval '10 seconds') >= 25 then
      raise exception 'rate_limited' using errcode = '54000';
    end if;
  end if;

  if p_reply_to is not null and not exists (
       select 1 from public.messages where id = p_reply_to and conversation_id = p_conversation and deleted_at is null) then
    raise exception 'invalid_reply' using errcode = '22023';
  end if;

  v_expires := case v_conv.disappear_mode
                 when '24h' then now() + interval '24 hours'
                 when '7d'  then now() + interval '7 days'
               end;
  if p_media_mode = 'disappearing' then
    v_expires := least(coalesce(v_expires, now() + interval '24 hours'), now() + interval '24 hours');
  end if;

  insert into public.messages (conversation_id, sender_id, type, body, metadata, reply_to_id, client_id, forwarded, expires_at, media_mode)
  values (p_conversation, p_sender, p_type, nullif(p_body, ''), coalesce(p_metadata, '{}'::jsonb), p_reply_to, p_client_id,
          p_forwarded, v_expires, coalesce(p_media_mode, 'normal'))
  returning * into v_msg;

  if p_media_ids is not null then
    insert into public.message_attachments (message_id, media_id, position)
    select v_msg.id, m.id, m.ord - 1
    from unnest(p_media_ids) with ordinality as m (id, ord);
  end if;

  update public.conversations set last_message_at = v_msg.created_at where id = p_conversation;

  update public.conversation_member_state set last_read_at = now(), cleared_at = cleared_at
   where conversation_id = p_conversation and user_id = p_sender;
  update public.conversation_members
     set last_delivered_at = now(),
         last_read_public_at = case
           when coalesce((select read_receipts from public.user_settings where user_id = p_sender), true) then now()
           else last_read_public_at end
   where conversation_id = p_conversation and user_id = p_sender;

  if p_type = 'system' then
    return v_msg;
  end if;

  select * into v_sender from public.profiles where id = p_sender;
  if v_conv.type = 'group' then
    v_title := coalesce(v_group.name, 'Group');
  else
    v_title := coalesce(nullif(v_sender.display_name, ''), v_sender.username);
  end if;

  for r in
    select m.user_id, st.muted_until, p.username
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
    left join public.conversation_member_state st
      on st.conversation_id = m.conversation_id and st.user_id = m.user_id
    where m.conversation_id = p_conversation and m.user_id <> p_sender and m.left_at is null
  loop
    if v_conv.type = 'group' and p_body is not null and p_body ~* ('(^|\W)@' || replace(r.username, '.', '\.') || '(\W|$)') then
      perform private.notify(r.user_id, 'mention', p_sender, v_title,
        '@' || v_sender.username || ' mentioned you: ' || left(p_body, 100),
        jsonb_build_object('url', '/chats/' || p_conversation, 'conversation_id', p_conversation),
        'conversation', p_conversation, 'mention:' || v_msg.id);
    elsif r.muted_until is null or r.muted_until < now() then
      perform private.notify(r.user_id, 'message', p_sender, v_title,
        case when v_conv.type = 'group' then v_sender.username || ': ' else '' end
          || case when p_media_mode = 'view_once' then '🔒 View-once ' || case when p_type = 'video' then 'video' else 'photo' end
                  else private.message_preview(p_type, p_body) end,
        jsonb_build_object('url', '/chats/' || p_conversation, 'conversation_id', p_conversation),
        'conversation', p_conversation, 'msg:' || p_conversation, true);
    end if;
  end loop;

  return v_msg;
end $$;

drop function public.send_message(uuid, text, text, jsonb, uuid, text, uuid[]);
create function public.send_message(
  p_conversation_id uuid, p_type text, p_body text default null, p_metadata jsonb default '{}'::jsonb,
  p_reply_to uuid default null, p_client_id text default null, p_media_ids uuid[] default null,
  p_media_mode text default 'normal'
) returns public.messages language plpgsql security definer set search_path = '' as $$
declare
  v_me     uuid := private.require_user();
  v_media  integer := coalesce(array_length(p_media_ids, 1), 0);
  v_meta   jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_mode   text := coalesce(p_media_mode, 'normal');
begin
  if p_type not in ('text', 'image', 'video', 'voice', 'gif', 'sticker', 'document', 'location', 'contact', 'link', 'story_reply') then
    raise exception 'invalid_message_type' using errcode = '22023';
  end if;
  if v_mode not in ('normal', 'view_once', 'disappearing', 'protected')
     or (v_mode <> 'normal' and p_type not in ('image', 'video')) then
    raise exception 'invalid_media_mode' using errcode = '22023';
  end if;
  if v_mode = 'view_once' and v_media <> 1 then
    raise exception 'view_once_single_media' using errcode = '22023';
  end if;
  if char_length(coalesce(p_body, '')) > 4000 then
    raise exception 'message_too_long' using errcode = '22023';
  end if;
  if pg_column_size(v_meta) > 8192 then
    raise exception 'metadata_too_large' using errcode = '22023';
  end if;
  if p_type in ('text', 'link', 'story_reply') and char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'empty_message' using errcode = '22023';
  end if;
  if p_type in ('image', 'video', 'voice', 'gif', 'document') and v_media = 0 then
    raise exception 'media_required' using errcode = '22023';
  end if;
  if p_type not in ('image', 'video', 'voice', 'gif', 'document') and v_media > 0 then
    raise exception 'media_not_allowed' using errcode = '22023';
  end if;
  if v_media > 10 then
    raise exception 'too_many_attachments' using errcode = '22023';
  end if;
  if v_media > 0 and (select count(*) from public.media_assets
                       where id = any (p_media_ids) and owner_id = v_me and status = 'ready' and purpose = 'message') <> v_media then
    raise exception 'invalid_media' using errcode = '22023';
  end if;
  if p_type = 'sticker' and coalesce(v_meta ->> 'sticker_id', '') !~ '^[a-z0-9_-]{1,40}$' then
    raise exception 'invalid_sticker' using errcode = '22023';
  end if;
  if p_type = 'location' and not (
       (v_meta ? 'share_id')
       or (jsonb_typeof(v_meta -> 'lat') = 'number' and jsonb_typeof(v_meta -> 'lng') = 'number'
           and (v_meta ->> 'lat')::float between -90 and 90 and (v_meta ->> 'lng')::float between -180 and 180)) then
    raise exception 'invalid_location' using errcode = '22023';
  end if;
  if p_type = 'location' and v_meta ? 'share_id' and not exists (
       select 1 from public.location_shares
       where id = (v_meta ->> 'share_id')::uuid and sharer_id = v_me and conversation_id = p_conversation_id) then
    raise exception 'invalid_location' using errcode = '22023';
  end if;
  if p_type = 'contact' then
    if not exists (select 1 from public.profiles p
                   where p.id = (v_meta ->> 'user_id')::uuid and p.status = 'active'
                     and not private.is_blocked(p.id, v_me)) then
      raise exception 'invalid_contact' using errcode = '22023';
    end if;
    select v_meta || jsonb_build_object('username', p.username, 'display_name', p.display_name,
                                        'avatar_media_id', p.avatar_media_id)
      into v_meta from public.profiles p where p.id = (v_meta ->> 'user_id')::uuid;
  end if;
  if p_type = 'story_reply' and not private.can_view_story((v_meta ->> 'story_id')::uuid, v_me) then
    raise exception 'story_not_found' using errcode = 'P0002';
  end if;

  return private.post_message(v_me, p_conversation_id, p_type, p_body, v_meta, p_reply_to, p_client_id, p_media_ids,
                              false, v_mode);
end $$;

-- Protected and view-once media can't be forwarded.
create or replace function public.forward_message(p_message_id uuid, p_conversation_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_me  uuid := private.require_user();
  v_src public.messages;
  v_media uuid[];
  v_target uuid;
  v_count integer := 0;
begin
  if coalesce(array_length(p_conversation_ids, 1), 0) between 1 and 5 is not true then
    raise exception 'invalid_targets' using errcode = '22023';
  end if;
  select * into v_src from public.messages where id = p_message_id;
  if v_src.id is null or v_src.deleted_at is not null or v_src.type in ('system', 'call', 'story_reply')
     or not private.can_read_message(v_src, v_me) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  if v_src.media_mode in ('view_once', 'protected') then
    raise exception 'cannot_forward_protected' using errcode = '42501';
  end if;
  select array_agg(media_id order by position) into v_media from public.message_attachments where message_id = v_src.id;
  foreach v_target in array p_conversation_ids loop
    perform private.post_message(v_me, v_target, v_src.type, v_src.body, v_src.metadata - 'share_id', null, null, v_media, true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- View-once: open (starts the server-side view window) and close (ends it)
-- -----------------------------------------------------------------------------
create or replace function public.open_message_media(p_message_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_me      uuid := private.require_user();
  v_msg     public.messages;
  v_expires timestamptz;
  v_secs    integer;
begin
  select * into v_msg from public.messages where id = p_message_id;
  if v_msg.id is null or v_msg.deleted_at is not null or v_msg.media_mode <> 'view_once'
     or not private.can_read_message(v_msg, v_me) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  if v_msg.sender_id = v_me then
    raise exception 'own_view_once' using errcode = '22023';
  end if;
  if not exists (select 1 from public.message_attachments a join public.media_assets m on m.id = a.media_id
                 where a.message_id = v_msg.id and m.status = 'ready') then
    raise exception 'media_expired' using errcode = 'P0002';
  end if;

  select v.view_expires_at into v_expires from public.message_media_views v
   where v.message_id = v_msg.id and v.viewer_id = v_me;
  if found then
    -- Re-opening is only possible inside the original window (e.g. a reload).
    if v_expires > now() then
      return v_expires;
    end if;
    raise exception 'already_viewed' using errcode = '42501';
  end if;

  -- Photos: 60 s. Videos: their length + 30 s, at most 10 minutes.
  select greatest(60, least(600, ceil(coalesce(max(m.duration_ms), 0) / 1000.0)::integer + 30)) into v_secs
    from public.message_attachments a join public.media_assets m on m.id = a.media_id
   where a.message_id = v_msg.id;

  insert into public.message_media_views (message_id, viewer_id, view_expires_at)
  values (v_msg.id, v_me, now() + make_interval(secs => v_secs))
  returning view_expires_at into v_expires;
  return v_expires;
end $$;

create or replace function public.close_message_media(p_message_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.message_media_views set view_expires_at = least(view_expires_at, now())
   where message_id = p_message_id and viewer_id = private.require_user()
$$;

-- -----------------------------------------------------------------------------
-- Screenshot reports for protected / view-once chat media. Browsers can only
-- observe some screenshot shortcuts, so this is best effort.
-- -----------------------------------------------------------------------------
create or replace function public.report_media_screenshot(p_message_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_me   uuid := private.require_user();
  v_msg  public.messages;
  v_name text;
begin
  select * into v_msg from public.messages where id = p_message_id;
  if v_msg.id is null or v_msg.deleted_at is not null or v_msg.media_mode not in ('view_once', 'protected')
     or not private.can_read_message(v_msg, v_me) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  if v_msg.sender_id = v_me or v_msg.sender_id is null then
    return false;
  end if;
  if exists (select 1 from public.media_security_events e
             where e.target_id = v_msg.id and e.user_id = v_me and e.created_at > now() - interval '1 minute') then
    return false;
  end if;

  insert into public.media_security_events (user_id, owner_id, kind, target_type, target_id)
  values (v_me, v_msg.sender_id, 'screenshot_shortcut', 'message', v_msg.id);
  update public.message_media_views set screenshot_at = coalesce(screenshot_at, now())
   where message_id = v_msg.id and viewer_id = v_me;

  select username into v_name from public.profiles where id = v_me;
  perform private.notify(v_msg.sender_id, 'snap_screenshot', v_me, 'Screenshot',
    '@' || v_name || ' may have taken a screenshot of your '
      || case when v_msg.media_mode = 'view_once' then 'view-once ' else 'protected ' end
      || case when v_msg.type = 'video' then 'video' else 'photo' end,
    jsonb_build_object('url', '/chats/' || v_msg.conversation_id, 'conversation_id', v_msg.conversation_id),
    'message', v_msg.id, 'mss:' || v_msg.id || ':' || v_me);
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Maintenance (called by the cron route): delete spent view-once media
-- (every recipient's window closed, or unopened for 14 days) and trim logs.
-- -----------------------------------------------------------------------------
create or replace function public.run_media_maintenance()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_view_once integer;
  v_logs integer;
  v_events integer;
begin
  with spent as (
    select msg.id from public.messages msg
    where msg.media_mode = 'view_once' and msg.deleted_at is null
      and (msg.created_at < now() - interval '14 days'
           or not exists (
             select 1 from public.conversation_members cm
             where cm.conversation_id = msg.conversation_id and cm.user_id <> msg.sender_id
               and cm.left_at is null and cm.joined_at <= msg.created_at
               and not exists (select 1 from public.message_media_views v
                               where v.message_id = msg.id and v.viewer_id = cm.user_id and v.view_expires_at <= now())))
  )
  update public.media_assets m set status = 'pending_delete', delete_after = now()
    from public.message_attachments a
    join spent on spent.id = a.message_id
   where a.media_id = m.id and m.status = 'ready';
  get diagnostics v_view_once = row_count;

  delete from public.media_access_log where accessed_at < now() - interval '30 days';
  get diagnostics v_logs = row_count;
  delete from public.media_security_events where created_at < now() - interval '180 days';
  get diagnostics v_events = row_count;

  return jsonb_build_object('view_once_media', v_view_once, 'access_logs', v_logs, 'security_events', v_events);
end $$;

-- -----------------------------------------------------------------------------
-- Privileges: nothing new is callable by anonymous visitors.
-- -----------------------------------------------------------------------------
revoke execute on function private.profile_media_visible(uuid, uuid, text) from public, anon;
revoke execute on function private.post_message(uuid, uuid, text, text, jsonb, uuid, text, uuid[], boolean, text) from public, anon, authenticated;
revoke execute on function public.profile_summary(text) from public, anon;
revoke execute on function public.send_message(uuid, text, text, jsonb, uuid, text, uuid[], text) from public, anon;
revoke execute on function public.open_message_media(uuid) from public, anon;
revoke execute on function public.close_message_media(uuid) from public, anon;
revoke execute on function public.report_media_screenshot(uuid) from public, anon;
revoke execute on function public.run_media_maintenance() from public, anon, authenticated;

grant execute on function private.profile_media_visible(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.post_message(uuid, uuid, text, text, jsonb, uuid, text, uuid[], boolean, text) to service_role;
grant execute on function public.profile_summary(text) to authenticated, service_role;
grant execute on function public.send_message(uuid, text, text, jsonb, uuid, text, uuid[], text) to authenticated, service_role;
grant execute on function public.open_message_media(uuid) to authenticated, service_role;
grant execute on function public.close_message_media(uuid) to authenticated, service_role;
grant execute on function public.report_media_screenshot(uuid) to authenticated, service_role;
grant execute on function public.run_media_maintenance() to service_role;

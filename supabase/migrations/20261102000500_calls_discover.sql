-- =============================================================================
-- Quick Chat — calls (LiveKit signalling state) and Discover / Spotlight.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Calls. Media flows through LiveKit; this table is the signalling + history
-- record. Access tokens are minted by the server only for joined participants.
-- -----------------------------------------------------------------------------
create table public.calls (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  initiator_id    uuid references public.profiles (id) on delete set null,
  kind            text not null check (kind in ('audio', 'video')),
  status          text not null default 'ringing' check (status in ('ringing', 'active', 'ended', 'missed', 'declined', 'cancelled')),
  room_name       text not null unique,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  ended_at        timestamptz
);
create index calls_conversation_time on public.calls (conversation_id, created_at desc);
create unique index calls_one_live_per_conversation on public.calls (conversation_id) where status in ('ringing', 'active');

create table public.call_participants (
  call_id   uuid not null references public.calls (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  status    text not null default 'ringing' check (status in ('ringing', 'joined', 'declined', 'left', 'missed')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  left_at   timestamptz,
  primary key (call_id, user_id)
);
create index call_participants_user on public.call_participants (user_id, invited_at desc);

create or replace function private.is_call_participant(p_call uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.call_participants where call_id = p_call and user_id = p_user)
$$;

create or replace function private.finish_call_if_empty(p_call uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_call public.calls;
  v_name text;
  r record;
begin
  select * into v_call from public.calls where id = p_call for update;
  if v_call.status not in ('ringing', 'active') then
    return;
  end if;
  -- A call stays live while at least two people are in it, or while it is still
  -- ringing someone and the initiator is waiting.
  if (select count(*) from public.call_participants where call_id = p_call and status = 'joined') >= 2
     or (v_call.status = 'ringing'
         and exists (select 1 from public.call_participants where call_id = p_call and status = 'joined')
         and exists (select 1 from public.call_participants where call_id = p_call and status = 'ringing')) then
    return;
  end if;

  select username into v_name from public.profiles where id = v_call.initiator_id;
  for r in select user_id from public.call_participants where call_id = p_call and status = 'ringing' loop
    update public.call_participants set status = 'missed' where call_id = p_call and user_id = r.user_id;
    perform private.notify(r.user_id, 'missed_call', v_call.initiator_id, 'Missed ' || v_call.kind || ' call',
      'You missed a call from @' || coalesce(v_name, 'someone'),
      jsonb_build_object('url', '/calls'), 'call', p_call, 'mc:' || p_call);
  end loop;
  update public.notifications set read_at = now()
   where dedupe_key = 'call:' || p_call and read_at is null;
  update public.call_participants set status = 'left', left_at = now() where call_id = p_call and status = 'joined';

  update public.calls set
    status = case
      when v_call.started_at is not null then 'ended'
      when exists (select 1 from public.call_participants where call_id = p_call and status = 'declined')
           and not exists (select 1 from public.call_participants where call_id = p_call and status = 'missed') then 'declined'
      when exists (select 1 from public.call_participants where call_id = p_call and status = 'missed') then 'missed'
      else 'cancelled' end,
    ended_at = now()
  where id = p_call;
end $$;

create or replace function public.start_call(p_conversation_id uuid, p_kind text)
returns public.calls language plpgsql security definer set search_path = '' as $$
declare
  v_me   uuid := private.require_user();
  v_call public.calls;
  v_conv public.conversations;
  v_title text;
  v_name text;
  r record;
begin
  if p_kind not in ('audio', 'video') then
    raise exception 'invalid_call_kind' using errcode = '22023';
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv.id is null or not private.is_member(p_conversation_id, v_me) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if v_conv.type = 'direct' and not private.can_message_direct(v_me,
       (select user_id from public.conversation_members where conversation_id = p_conversation_id and user_id <> v_me)) then
    raise exception 'cannot_call_user' using errcode = '42501';
  end if;

  -- Clean up a stale ringing call before reusing the conversation.
  update public.calls set status = 'missed', ended_at = now()
   where conversation_id = p_conversation_id and status = 'ringing' and created_at < now() - interval '60 seconds';

  select * into v_call from public.calls where conversation_id = p_conversation_id and status in ('ringing', 'active');
  if v_call.id is not null then
    -- Join the existing call instead of creating a second one.
    insert into public.call_participants (call_id, user_id, status) values (v_call.id, v_me, 'ringing')
    on conflict do nothing;
    return v_call;
  end if;
  if (select count(*) from public.calls where initiator_id = v_me and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.calls (conversation_id, initiator_id, kind, room_name)
  values (p_conversation_id, v_me, p_kind, 'qc_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into v_call;

  insert into public.call_participants (call_id, user_id, status)
  select v_call.id, m.user_id, case when m.user_id = v_me then 'joined' else 'ringing' end
  from public.conversation_members m
  where m.conversation_id = p_conversation_id and m.left_at is null;
  update public.call_participants set joined_at = now() where call_id = v_call.id and user_id = v_me;

  select username into v_name from public.profiles where id = v_me;
  v_title := coalesce((select name from public.groups where conversation_id = p_conversation_id), '@' || v_name);
  for r in select user_id from public.call_participants where call_id = v_call.id and user_id <> v_me loop
    perform private.notify(r.user_id, 'incoming_call', v_me, 'Incoming ' || p_kind || ' call',
      v_title || ' is calling you',
      jsonb_build_object('url', '/calls/' || v_call.id, 'call_id', v_call.id, 'kind', p_kind),
      'call', v_call.id, 'call:' || v_call.id);
  end loop;
  return v_call;
end $$;

-- Marks the caller as joined. The API mints a LiveKit token only after this succeeds.
create or replace function public.join_call(p_call_id uuid)
returns public.calls language plpgsql security definer set search_path = '' as $$
declare
  v_me   uuid := private.require_user();
  v_call public.calls;
begin
  select * into v_call from public.calls where id = p_call_id for update;
  if v_call.id is null or not private.is_call_participant(p_call_id, v_me)
     or not private.is_member(v_call.conversation_id, v_me) then
    raise exception 'call_not_found' using errcode = 'P0002';
  end if;
  if v_call.status not in ('ringing', 'active') then
    raise exception 'call_ended' using errcode = '42501';
  end if;
  update public.call_participants set status = 'joined', joined_at = coalesce(joined_at, now()), left_at = null
   where call_id = p_call_id and user_id = v_me;
  if v_call.initiator_id <> v_me and v_call.status = 'ringing' then
    update public.calls set status = 'active', started_at = now() where id = p_call_id returning * into v_call;
  end if;
  update public.notifications set read_at = now()
   where user_id = v_me and dedupe_key = 'call:' || p_call_id and read_at is null;
  return v_call;
end $$;

create or replace function public.decline_call(p_call_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  update public.call_participants set status = 'declined', left_at = now()
   where call_id = p_call_id and user_id = v_me and status = 'ringing';
  if not found then
    raise exception 'call_not_found' using errcode = 'P0002';
  end if;
  update public.notifications set read_at = now()
   where user_id = v_me and dedupe_key = 'call:' || p_call_id and read_at is null;
  perform private.finish_call_if_empty(p_call_id);
end $$;

create or replace function public.leave_call(p_call_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  update public.call_participants set status = 'left', left_at = now()
   where call_id = p_call_id and user_id = v_me and status in ('joined', 'ringing');
  perform private.finish_call_if_empty(p_call_id);
end $$;

create or replace function public.my_calls(p_limit integer default 50, p_before timestamptz default null)
returns table (call_id uuid, conversation_id uuid, kind text, status text, my_status text, initiator_id uuid,
               is_outgoing boolean, created_at timestamptz, started_at timestamptz, ended_at timestamptz,
               title text, avatar_media_id uuid, other_user_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.id, c.conversation_id, c.kind, c.status, cp.status, c.initiator_id, c.initiator_id = auth.uid(),
         c.created_at, c.started_at, c.ended_at,
         coalesce(g.name, nullif(op.display_name, ''), op.username, 'Unknown'),
         coalesce(g.avatar_media_id, op.avatar_media_id),
         op.id
  from public.call_participants cp
  join public.calls c on c.id = cp.call_id
  left join public.groups g on g.conversation_id = c.conversation_id
  left join lateral (
    select p.* from public.conversation_members m join public.profiles p on p.id = m.user_id
    where g.conversation_id is null and m.conversation_id = c.conversation_id and m.user_id <> auth.uid()
      and p.status = 'active' and not private.is_blocked(p.id, auth.uid())
    limit 1
  ) op on true
  where cp.user_id = auth.uid() and (p_before is null or c.created_at < p_before)
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- -----------------------------------------------------------------------------
-- Discover / Spotlight
-- -----------------------------------------------------------------------------
create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete cascade,
  media_id      uuid references public.media_assets (id) on delete set null,
  media_kind    text not null check (media_kind in ('image', 'video')),
  caption       text not null default '' check (char_length(caption) <= 500),
  hashtags      text[] not null default '{}',
  visibility    text not null default 'public' check (visibility in ('public', 'followers')),
  status        text not null default 'active' check (status in ('active', 'removed', 'deleted')),
  like_count    integer not null default 0,
  comment_count integer not null default 0,
  view_count    integer not null default 0,
  share_count   integer not null default 0,
  created_at    timestamptz not null default now()
);
create index posts_author_time on public.posts (author_id, created_at desc) where status = 'active';
create index posts_public_time on public.posts (created_at desc) where status = 'active' and visibility = 'public';
create index posts_hashtags on public.posts using gin (hashtags);
create index posts_caption_trgm on public.posts using gin (caption extensions.gin_trgm_ops);

create table public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user on public.post_likes (user_id, created_at desc);

create table public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  parent_id  uuid references public.post_comments (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  status     text not null default 'active' check (status in ('active', 'removed', 'deleted')),
  created_at timestamptz not null default now()
);
create index post_comments_post on public.post_comments (post_id, created_at);

create table public.saved_posts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table public.post_views (
  post_id   uuid not null references public.posts (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_id)
);

create or replace function private.can_view_post(p_post_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p join public.profiles a on a.id = p.author_id
    where p.id = p_post_id
      and (p.author_id = p_user or (
        p.status = 'active' and a.status = 'active'
        and not private.is_blocked(p.author_id, p_user)
        and (
          (p.visibility = 'public' and (not a.is_private or private.are_friends(p.author_id, p_user)))
          or exists (select 1 from public.follows f where f.follower_id = p_user and f.followee_id = p.author_id)
        )))
  )
$$;

create or replace function private.extract_hashtags(p_text text)
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct lower(m[1])), '{}')
  from regexp_matches(coalesce(p_text, ''), '#([A-Za-z0-9_]{1,40})', 'g') as m
$$;

create or replace function public.create_post(p_media_id uuid, p_caption text default '', p_visibility text default 'public')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me    uuid := private.require_user();
  v_media public.media_assets;
  v_id    uuid;
begin
  select * into v_media from public.media_assets
   where id = p_media_id and owner_id = v_me and status = 'ready' and purpose = 'post' and kind in ('image', 'video');
  if v_media.id is null or exists (select 1 from public.posts where media_id = p_media_id) then
    raise exception 'invalid_media' using errcode = '22023';
  end if;
  if p_visibility not in ('public', 'followers') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;
  if (select count(*) from public.posts where author_id = v_me and created_at > now() - interval '1 day') >= 50 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.posts (author_id, media_id, media_kind, caption, hashtags, visibility)
  values (v_me, p_media_id, v_media.kind, left(coalesce(p_caption, ''), 500),
          private.extract_hashtags(p_caption), p_visibility)
  returning id into v_id;
  update public.profiles set is_creator = true where id = v_me and not is_creator;
  return v_id;
end $$;

create or replace function public.delete_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_media uuid;
begin
  update public.posts set status = 'deleted' where id = p_post_id and author_id = auth.uid() and status <> 'deleted'
  returning media_id into v_media;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  update public.media_assets set status = 'pending_delete', delete_after = now() where id = v_media;
end $$;

create or replace function public.toggle_post_like(p_post_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
  v_author uuid;
  v_name text;
begin
  if not private.can_view_post(p_post_id, v_me) then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  delete from public.post_likes where post_id = p_post_id and user_id = v_me;
  if found then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = p_post_id;
    return false;
  end if;
  insert into public.post_likes (post_id, user_id) values (p_post_id, v_me);
  update public.posts set like_count = like_count + 1 where id = p_post_id returning author_id into v_author;
  select username into v_name from public.profiles where id = v_me;
  perform private.notify(v_author, 'post_like', v_me, 'New like', '@' || v_name || ' liked your post',
    jsonb_build_object('url', '/discover/' || p_post_id), 'post', p_post_id, 'pl:' || p_post_id || ':' || v_me);
  return true;
end $$;

create or replace function public.add_post_comment(p_post_id uuid, p_body text, p_parent_id uuid default null)
returns public.post_comments language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
  v_row public.post_comments;
  v_author uuid;
  v_parent_author uuid;
  v_name text;
begin
  if not private.can_view_post(p_post_id, v_me) then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 or char_length(p_body) > 500 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  if p_parent_id is not null then
    select user_id into v_parent_author from public.post_comments
     where id = p_parent_id and post_id = p_post_id and status = 'active';
    if not found then
      raise exception 'invalid_parent' using errcode = '22023';
    end if;
  end if;
  if (select count(*) from public.post_comments where user_id = v_me and created_at > now() - interval '1 minute') >= 15 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.post_comments (post_id, user_id, parent_id, body) values (p_post_id, v_me, p_parent_id, trim(p_body))
  returning * into v_row;
  update public.posts set comment_count = comment_count + 1 where id = p_post_id returning author_id into v_author;
  select username into v_name from public.profiles where id = v_me;
  perform private.notify(v_author, 'post_comment', v_me, 'New comment',
    '@' || v_name || ': ' || left(p_body, 100),
    jsonb_build_object('url', '/discover/' || p_post_id), 'post', p_post_id, 'pc:' || v_row.id);
  if v_parent_author is not null and v_parent_author <> v_author then
    perform private.notify(v_parent_author, 'post_comment', v_me, 'New reply',
      '@' || v_name || ' replied: ' || left(p_body, 100),
      jsonb_build_object('url', '/discover/' || p_post_id), 'post', p_post_id, 'pcr:' || v_row.id);
  end if;
  return v_row;
end $$;

create or replace function public.delete_post_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_post uuid;
begin
  update public.post_comments c set status = 'deleted', body = '[deleted]'
   where c.id = p_comment_id and c.status = 'active'
     and (c.user_id = auth.uid()
          or exists (select 1 from public.posts p where p.id = c.post_id and p.author_id = auth.uid()))
  returning post_id into v_post;
  if not found then
    raise exception 'comment_not_found' using errcode = 'P0002';
  end if;
  update public.posts set comment_count = greatest(comment_count - 1, 0) where id = v_post;
end $$;

create or replace function public.toggle_saved_post(p_post_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  delete from public.saved_posts where user_id = v_me and post_id = p_post_id;
  if found then
    return false;
  end if;
  if not private.can_view_post(p_post_id, v_me) then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  insert into public.saved_posts (user_id, post_id) values (v_me, p_post_id);
  return true;
end $$;

create or replace function public.record_post_view(p_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  if not private.can_view_post(p_post_id, v_me) then
    return;
  end if;
  insert into public.post_views (post_id, viewer_id) values (p_post_id, v_me) on conflict do nothing;
  if found then
    update public.posts set view_count = view_count + 1 where id = p_post_id;
  end if;
end $$;

create or replace function public.record_post_share(p_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.can_view_post(p_post_id, private.require_user()) then
    update public.posts set share_count = share_count + 1 where id = p_post_id;
  end if;
end $$;

-- Ranking: engagement weighted by recency (gravity decay), with a boost for
-- followed creators and friends in "for_you"; pure recency in "following".
create or replace function public.discover_feed(p_mode text default 'for_you', p_limit integer default 10, p_offset integer default 0, p_hashtag text default null)
returns table (id uuid, author_id uuid, username text, display_name text, avatar_media_id uuid, is_verified boolean,
               media_id uuid, media_kind text, caption text, hashtags text[], like_count integer, comment_count integer,
               view_count integer, share_count integer, created_at timestamptz, liked boolean, saved boolean,
               following boolean, score double precision)
language sql stable security definer set search_path = '' as $$
  with base as (
    select p.*, a.username, a.display_name, a.avatar_media_id, a.is_verified,
           exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.author_id) as following,
           (p.like_count * 3 + p.comment_count * 4 + p.share_count * 5 + p.view_count * 0.2 + 1)
             / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 1.5) as hot
    from public.posts p
    join public.profiles a on a.id = p.author_id
    where p.status = 'active' and p.media_id is not null
      and (p_hashtag is null or lower(p_hashtag) = any (p.hashtags))
      and private.can_view_post(p.id, auth.uid())
  )
  select b.id, b.author_id, b.username, b.display_name, b.avatar_media_id, b.is_verified, b.media_id, b.media_kind,
         b.caption, b.hashtags, b.like_count, b.comment_count, b.view_count, b.share_count, b.created_at,
         exists (select 1 from public.post_likes l where l.post_id = b.id and l.user_id = auth.uid()),
         exists (select 1 from public.saved_posts s where s.post_id = b.id and s.user_id = auth.uid()),
         b.following,
         case p_mode
           when 'following' then extract(epoch from b.created_at)
           when 'trending'  then b.hot
           else b.hot * (case when b.following then 2.0 else 1.0 end)
                      * (case when private.are_friends(b.author_id, auth.uid()) then 1.5 else 1.0 end)
                      * (case when exists (select 1 from public.post_views v where v.post_id = b.id and v.viewer_id = auth.uid())
                              then 0.3 else 1.0 end)
         end
  from base b
  where p_mode <> 'following' or b.following or b.author_id = auth.uid()
  order by 19 desc, b.created_at desc
  limit least(greatest(p_limit, 1), 30) offset greatest(p_offset, 0)
$$;

create or replace function public.trending_hashtags(p_limit integer default 20)
returns table (tag text, post_count bigint)
language sql stable security definer set search_path = '' as $$
  select t, count(*) from public.posts p, unnest(p.hashtags) t
  where p.status = 'active' and p.visibility = 'public' and p.created_at > now() - interval '7 days'
  group by t order by 2 desc, t limit least(greatest(p_limit, 1), 50)
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.calls             enable row level security;
alter table public.call_participants enable row level security;
alter table public.posts             enable row level security;
alter table public.post_likes        enable row level security;
alter table public.post_comments     enable row level security;
alter table public.saved_posts       enable row level security;
alter table public.post_views        enable row level security;

create policy calls_select on public.calls for select to authenticated
  using (private.is_call_participant(id, (select auth.uid())));
create policy call_participants_select on public.call_participants for select to authenticated
  using (private.is_call_participant(call_id, (select auth.uid())));

create policy posts_select on public.posts for select to authenticated
  using (private.can_view_post(id, (select auth.uid())) or (select private.is_admin()));
create policy post_likes_select on public.post_likes for select to authenticated
  using (user_id = (select auth.uid()) or private.can_view_post(post_id, (select auth.uid())));
create policy post_comments_select on public.post_comments for select to authenticated
  using ((status = 'active' and private.can_view_post(post_id, (select auth.uid()))) or (select private.is_admin()));
create policy saved_posts_select_own on public.saved_posts for select to authenticated
  using (user_id = (select auth.uid()));
create policy post_views_select_own on public.post_views for select to authenticated
  using (viewer_id = (select auth.uid()));

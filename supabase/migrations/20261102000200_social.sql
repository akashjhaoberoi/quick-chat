-- =============================================================================
-- Quick Chat — social graph: friend requests, friendships, blocks, follows,
-- custom friend lists, presence privacy, suggestions.
-- =============================================================================

create table public.friend_requests (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  receiver_id  uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> receiver_id)
);
-- At most one pending request per unordered pair.
create unique index friend_requests_one_pending
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';
create index friend_requests_receiver on public.friend_requests (receiver_id, status, created_at desc);
create index friend_requests_sender on public.friend_requests (sender_id, status, created_at desc);

-- Canonical ordering (user_a < user_b) guarantees one row per friendship.
create table public.friendships (
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_user_b on public.friendships (user_b);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked on public.blocks (blocked_id);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on public.follows (followee_id, created_at desc);

create table public.friend_lists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.friend_list_members (
  list_id uuid not null references public.friend_lists (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (list_id, user_id)
);
create index friend_list_members_user on public.friend_list_members (user_id);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function private.are_friends(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships
    where user_a = least(p_a, p_b) and user_b = greatest(p_a, p_b)
  )
$$;

create or replace function private.is_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  )
$$;

create or replace function private.friend_ids(p_user uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select case when user_a = p_user then user_b else user_a end
  from public.friendships where user_a = p_user or user_b = p_user
$$;

create or replace function private.can_see_presence(p_target uuid, p_viewer uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select p_target = p_viewer or (
    not private.is_blocked(p_target, p_viewer)
    and coalesce((
      select case s.last_active_visibility
               when 'everyone' then true
               when 'friends'  then private.are_friends(p_target, p_viewer)
               else false
             end
      from public.user_settings s where s.user_id = p_target
    ), false)
  )
$$;

create or replace function private.require_user()
returns uuid language plpgsql stable as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_active_user(v) then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function private.score_is_public(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select show_score from public.user_settings where user_id = p_user), false)
$$;

-- -----------------------------------------------------------------------------
-- Friend request RPCs
-- -----------------------------------------------------------------------------
create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me  uuid := private.require_user();
  v_req public.friend_requests;
  v_name text;
begin
  select * into v_req from public.friend_requests
   where id = p_request_id and receiver_id = v_me and status = 'pending'
   for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if p_accept then
    if private.is_blocked(v_req.sender_id, v_me) then
      raise exception 'request_not_found' using errcode = 'P0002';
    end if;
    insert into public.friendships (user_a, user_b)
    values (least(v_req.sender_id, v_me), greatest(v_req.sender_id, v_me))
    on conflict do nothing;
    update public.friend_requests set status = 'accepted', responded_at = now() where id = v_req.id;
    select username into v_name from public.profiles where id = v_me;
    perform private.notify(v_req.sender_id, 'friend_accepted', v_me, 'Friend request accepted',
      '@' || v_name || ' accepted your friend request',
      jsonb_build_object('url', '/profile/' || v_name), 'profile', v_me, 'fa:' || v_req.id);
    update public.notifications set read_at = now()
     where user_id = v_me and dedupe_key = 'fr:' || v_req.id and read_at is null;
    return 'accepted';
  else
    update public.friend_requests set status = 'rejected', responded_at = now() where id = v_req.id;
    update public.notifications set read_at = now()
     where user_id = v_me and dedupe_key = 'fr:' || v_req.id and read_at is null;
    return 'rejected';
  end if;
end $$;

create or replace function public.send_friend_request(p_target uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me      uuid := private.require_user();
  v_who     text;
  v_reverse uuid;
  v_id      uuid;
  v_name    text;
begin
  if p_target = v_me then
    raise exception 'cannot_add_self' using errcode = '22023';
  end if;
  -- Blocks are indistinguishable from a missing user on purpose.
  if not private.is_active_user(p_target) or private.is_blocked(v_me, p_target) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if private.are_friends(v_me, p_target) then
    return 'already_friends';
  end if;

  select id into v_reverse from public.friend_requests
   where sender_id = p_target and receiver_id = v_me and status = 'pending';
  if v_reverse is not null then
    perform public.respond_friend_request(v_reverse, true);
    return 'accepted';
  end if;

  if exists (select 1 from public.friend_requests
             where sender_id = v_me and receiver_id = p_target and status = 'pending') then
    return 'pending';
  end if;

  select who_can_add into v_who from public.user_settings where user_id = p_target;
  if v_who = 'nobody' or (v_who = 'friends_of_friends' and not exists (
        select 1 from private.friend_ids(v_me) f
        where f in (select private.friend_ids(p_target)))) then
    raise exception 'requests_disabled' using errcode = '42501';
  end if;

  if (select count(*) from public.friend_requests
      where sender_id = v_me and created_at > now() - interval '1 day') >= 100 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.friend_requests (sender_id, receiver_id) values (v_me, p_target) returning id into v_id;
  select username into v_name from public.profiles where id = v_me;
  perform private.notify(p_target, 'friend_request', v_me, 'New friend request',
    '@' || v_name || ' wants to be your friend',
    jsonb_build_object('url', '/friends?tab=requests'), 'friend_request', v_id, 'fr:' || v_id);
  return 'sent';
end $$;

create or replace function public.cancel_friend_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me  uuid := private.require_user();
  v_req public.friend_requests;
begin
  update public.friend_requests set status = 'cancelled', responded_at = now()
   where id = p_request_id and sender_id = v_me and status = 'pending'
  returning * into v_req;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  delete from public.notifications where user_id = v_req.receiver_id and dedupe_key = 'fr:' || v_req.id;
end $$;

create or replace function public.remove_friend(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  delete from public.friendships where user_a = least(v_me, p_other) and user_b = greatest(v_me, p_other);
  delete from public.streaks where user_a = least(v_me, p_other) and user_b = greatest(v_me, p_other);
  delete from public.friend_list_members m using public.friend_lists l
   where m.list_id = l.id and ((l.owner_id = v_me and m.user_id = p_other) or (l.owner_id = p_other and m.user_id = v_me));
end $$;

create or replace function public.block_user(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  if p_other = v_me then
    raise exception 'cannot_block_self' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_me, p_other) on conflict do nothing;
  perform public.remove_friend(p_other);
  update public.friend_requests set status = 'cancelled', responded_at = now()
   where status = 'pending'
     and ((sender_id = v_me and receiver_id = p_other) or (sender_id = p_other and receiver_id = v_me));
  delete from public.follows
   where (follower_id = v_me and followee_id = p_other) or (follower_id = p_other and followee_id = v_me);
  delete from public.notifications
   where (user_id = v_me and actor_id = p_other) or (user_id = p_other and actor_id = v_me);
end $$;

create or replace function public.unblock_user(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  delete from public.blocks where blocker_id = v_me and blocked_id = p_other;
end $$;

create or replace function public.my_blocked_users()
returns table (id uuid, username text, display_name text, avatar_media_id uuid, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_media_id, b.created_at
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc
$$;

create or replace function public.mutual_friends(p_other uuid, p_limit integer default 20)
returns table (id uuid, username text, display_name text, avatar_media_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_media_id
  from public.profiles p
  where not private.is_blocked(p_other, auth.uid())
    and p.status = 'active'
    and p.id in (select private.friend_ids(auth.uid()))
    and p.id in (select private.friend_ids(p_other))
  order by p.username
  limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.friend_suggestions(p_limit integer default 20)
returns table (id uuid, username text, display_name text, avatar_media_id uuid, mutual_count bigint)
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as id),
  mine as (select private.friend_ids((select id from me)) as fid),
  excluded as (
    select (select id from me) as uid
    union select fid from mine
    union select case when blocker_id = (select id from me) then blocked_id else blocker_id end
          from public.blocks where blocker_id = (select id from me) or blocked_id = (select id from me)
    union select case when sender_id = (select id from me) then receiver_id else sender_id end
          from public.friend_requests
          where status = 'pending' and (sender_id = (select id from me) or receiver_id = (select id from me))
  ),
  fof as (
    select case when f.user_a = m.fid then f.user_b else f.user_a end as candidate, count(*) as mutual_count
    from mine m join public.friendships f on f.user_a = m.fid or f.user_b = m.fid
    group by 1
  ),
  ranked as (
    select c.candidate, c.mutual_count from fof c
    union all
    select p.id, 0 from public.profiles p
    where p.status = 'active' and p.onboarded
    order by 2 desc
    limit 500
  )
  select p.id, p.username, p.display_name, p.avatar_media_id, max(r.mutual_count)
  from ranked r
  join public.profiles p on p.id = r.candidate
  join public.user_settings s on s.user_id = p.id
  where p.status = 'active' and s.discoverable and s.who_can_add <> 'nobody'
    and r.candidate not in (select uid from excluded)
  group by p.id, p.username, p.display_name, p.avatar_media_id, p.created_at
  order by max(r.mutual_count) desc, p.created_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

create or replace function public.get_presence(p_ids uuid[])
returns table (user_id uuid, last_seen_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select pr.user_id, pr.last_seen_at
  from public.user_presence pr
  where pr.user_id = any (p_ids[1:200])
    and private.can_see_presence(pr.user_id, auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- Follows (creators / public profiles)
-- -----------------------------------------------------------------------------
create or replace function public.toggle_follow(p_target uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
  v_private boolean;
  v_name text;
begin
  if p_target = v_me then
    raise exception 'cannot_follow_self' using errcode = '22023';
  end if;
  delete from public.follows where follower_id = v_me and followee_id = p_target;
  if found then
    return false;
  end if;
  select is_private into v_private from public.profiles where id = p_target and status = 'active';
  if not found or private.is_blocked(v_me, p_target) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if v_private and not private.are_friends(v_me, p_target) then
    raise exception 'private_account' using errcode = '42501';
  end if;
  insert into public.follows (follower_id, followee_id) values (v_me, p_target);
  select username into v_name from public.profiles where id = v_me;
  perform private.notify(p_target, 'follow', v_me, 'New follower', '@' || v_name || ' started following you',
    jsonb_build_object('url', '/profile/' || v_name), 'profile', v_me, 'follow:' || v_me);
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Custom friend lists
-- -----------------------------------------------------------------------------
create or replace function public.save_friend_list(p_list_id uuid, p_name text, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
  v_id uuid := p_list_id;
begin
  if coalesce(array_length(p_member_ids, 1), 0) > 500 then
    raise exception 'too_many_members' using errcode = '22023';
  end if;
  if v_id is null then
    if (select count(*) from public.friend_lists where owner_id = v_me) >= 50 then
      raise exception 'too_many_lists' using errcode = '54000';
    end if;
    insert into public.friend_lists (owner_id, name) values (v_me, trim(p_name)) returning id into v_id;
  else
    update public.friend_lists set name = trim(p_name) where id = v_id and owner_id = v_me;
    if not found then
      raise exception 'list_not_found' using errcode = 'P0002';
    end if;
    delete from public.friend_list_members where list_id = v_id;
  end if;
  insert into public.friend_list_members (list_id, user_id)
  select v_id, m from unnest(coalesce(p_member_ids, '{}')) m
  where private.are_friends(v_me, m)
  on conflict do nothing;
  return v_id;
end $$;

create or replace function public.delete_friend_list(p_list_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.friend_lists where id = p_list_id and owner_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.friend_requests     enable row level security;
alter table public.friendships         enable row level security;
alter table public.blocks              enable row level security;
alter table public.follows             enable row level security;
alter table public.friend_lists        enable row level security;
alter table public.friend_list_members enable row level security;

create policy profiles_select_visible on public.profiles for select to authenticated
  using (status = 'active' and not private.is_blocked(id, (select auth.uid())));

create policy friend_requests_select on public.friend_requests for select to authenticated
  using (sender_id = (select auth.uid()) or receiver_id = (select auth.uid()));

create policy friendships_select on public.friendships for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));

create policy blocks_select_own on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy follows_select on public.follows for select to authenticated
  using (
    follower_id = (select auth.uid()) or followee_id = (select auth.uid())
    or not (private.is_blocked(followee_id, (select auth.uid())) or private.is_blocked(follower_id, (select auth.uid())))
  );

create policy friend_lists_own on public.friend_lists for select to authenticated
  using (owner_id = (select auth.uid()));
create policy friend_list_members_own on public.friend_list_members for select to authenticated
  using (exists (select 1 from public.friend_lists l where l.id = list_id and l.owner_id = (select auth.uid())));

create policy presence_select_visible on public.user_presence for select to authenticated
  using (private.can_see_presence(user_id, (select auth.uid())));

create policy scores_select_visible on public.user_scores for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      not private.is_blocked(user_id, (select auth.uid()))
      and private.score_is_public(user_id)
    )
  );

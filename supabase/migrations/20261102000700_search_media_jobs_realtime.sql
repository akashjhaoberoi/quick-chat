-- =============================================================================
-- Quick Chat — conversation list, search, media access, push dispatch,
-- maintenance (expiry enforcement), realtime and privilege hardening.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conversation list (SECURITY INVOKER: relies on RLS for every table it reads)
-- -----------------------------------------------------------------------------
create or replace function public.my_conversations(p_archived boolean default false, p_limit integer default 50,
                                                   p_before timestamptz default null)
returns table (
  conversation_id uuid, type text, title text, avatar_media_id uuid, other_user_id uuid, other_username text,
  member_count bigint, role text, disappear_mode text, last_message_at timestamptz,
  last_message_id uuid, last_message_type text, last_message_body text, last_message_sender_id uuid,
  last_message_deleted boolean, unread_count bigint, muted_until timestamptz, archived boolean, streak_count integer
) language sql stable security invoker set search_path = '' as $$
  select c.id, c.type,
         coalesce(g.name, nullif(op.display_name, ''), op.username, 'Unknown user'),
         coalesce(g.avatar_media_id, op.avatar_media_id),
         op.id, op.username,
         (select count(*) from public.conversation_members x where x.conversation_id = c.id and x.left_at is null),
         me.role, c.disappear_mode,
         coalesce(lm.created_at, c.created_at),
         lm.id, lm.type, lm.body, lm.sender_id, lm.deleted_at is not null,
         (select count(*) from (
            select 1 from public.messages u
            where u.conversation_id = c.id and u.created_at > st.last_read_at
              and u.sender_id is distinct from (select auth.uid()) and u.type <> 'system'
            limit 100) t),
         st.muted_until, st.archived_at is not null,
         (select private.effective_streak(s.count, s.last_counted_day) from public.streaks s
           where op.id is not null and s.user_a = least(op.id, (select auth.uid())) and s.user_b = greatest(op.id, (select auth.uid())))
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_member_state st on st.conversation_id = me.conversation_id and st.user_id = me.user_id
  left join public.groups g on g.conversation_id = c.id
  left join lateral (
    select p.id, p.username, p.display_name, p.avatar_media_id
    from public.conversation_members om join public.profiles p on p.id = om.user_id
    where c.type = 'direct' and om.conversation_id = c.id and om.user_id <> (select auth.uid())
    limit 1
  ) op on true
  left join lateral (
    select m.id, m.type, m.body, m.sender_id, m.deleted_at, m.created_at
    from public.messages m where m.conversation_id = c.id
    order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = (select auth.uid()) and me.left_at is null
    and (st.archived_at is not null) = coalesce(p_archived, false)
    and (st.cleared_at is null or lm.created_at is not null)
    and (c.type = 'group' or lm.created_at is not null or c.created_by = (select auth.uid()))
    and (p_before is null or coalesce(lm.created_at, c.created_at) < p_before)
  order by coalesce(lm.created_at, c.created_at) desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- -----------------------------------------------------------------------------
-- Search
-- -----------------------------------------------------------------------------
create or replace function private.prefix_tsquery(p_query text)
returns tsquery language sql immutable as $$
  select case when count(*) = 0 then null
              else to_tsquery('simple', string_agg(quote_literal(w) || ':*', ' & ')) end
  from unnest(regexp_split_to_array(lower(regexp_replace(coalesce(p_query, ''), '[^[:alnum:][:space:]]+', ' ', 'g')), '\s+')) w
  where w <> ''
$$;

create or replace function public.search_users(p_query text, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, username text, display_name text, avatar_media_id uuid, is_creator boolean, is_verified boolean,
               is_friend boolean, request_status text)
language sql stable security definer set search_path = '' as $$
  with q as (select lower(trim(both '@' from trim(coalesce(p_query, '')))) as t)
  select p.id, p.username, p.display_name, p.avatar_media_id, p.is_creator, p.is_verified,
         private.are_friends(p.id, auth.uid()),
         (select case when fr.sender_id = auth.uid() then 'outgoing' else 'incoming' end
          from public.friend_requests fr
          where fr.status = 'pending'
            and ((fr.sender_id = auth.uid() and fr.receiver_id = p.id) or (fr.sender_id = p.id and fr.receiver_id = auth.uid())))
  from public.profiles p
  join public.user_settings s on s.user_id = p.id
  cross join q
  where char_length(q.t) >= 1
    and p.status = 'active'
    and p.id <> auth.uid()
    and not private.is_blocked(p.id, auth.uid())
    and (s.discoverable or private.are_friends(p.id, auth.uid()))
    and (p.username like q.t || '%' or p.username like '%' || q.t || '%'
         or lower(p.display_name) like '%' || q.t || '%'
         or extensions.similarity(p.username, q.t) > 0.3)
  order by (p.username = q.t) desc, (p.username like q.t || '%') desc,
           private.are_friends(p.id, auth.uid()) desc,
           extensions.similarity(p.username, q.t) desc, p.username
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

create or replace function public.search_messages(p_query text, p_conversation_id uuid default null,
                                                  p_limit integer default 30, p_offset integer default 0)
returns table (id uuid, conversation_id uuid, sender_id uuid, type text, body text, created_at timestamptz, rank real)
language sql stable security invoker set search_path = '' as $$
  select m.id, m.conversation_id, m.sender_id, m.type, m.body, m.created_at,
         ts_rank(m.search_tsv, private.prefix_tsquery(p_query))
  from public.messages m
  where private.prefix_tsquery(p_query) is not null
    and m.search_tsv @@ private.prefix_tsquery(p_query)
    and m.deleted_at is null and m.type not in ('system', 'call')
    and (p_conversation_id is null or m.conversation_id = p_conversation_id)
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

create or replace function public.search_groups(p_query text, p_limit integer default 20)
returns table (conversation_id uuid, name text, avatar_media_id uuid, member_count bigint)
language sql stable security invoker set search_path = '' as $$
  select g.conversation_id, g.name, g.avatar_media_id,
         (select count(*) from public.conversation_members m where m.conversation_id = g.conversation_id and m.left_at is null)
  from public.groups g
  where g.name ilike '%' || coalesce(p_query, '') || '%'
  order by extensions.similarity(g.name, coalesce(p_query, '')) desc
  limit least(greatest(p_limit, 1), 50)
$$;

create or replace function public.search_posts(p_query text, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, author_id uuid, username text, media_id uuid, media_kind text, caption text,
               like_count integer, view_count integer, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.author_id, a.username, p.media_id, p.media_kind, p.caption, p.like_count, p.view_count, p.created_at
  from public.posts p join public.profiles a on a.id = p.author_id
  where p.status = 'active' and p.media_id is not null
    and (lower(trim(both '#' from p_query)) = any (p.hashtags) or p.caption ilike '%' || p_query || '%')
    and private.can_view_post(p.id, auth.uid())
  order by p.like_count desc, p.created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

create or replace function public.search_creators(p_query text, p_limit integer default 20)
returns table (id uuid, username text, display_name text, avatar_media_id uuid, is_verified boolean,
               follower_count bigint, following boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_media_id, p.is_verified,
         (select count(*) from public.follows f where f.followee_id = p.id),
         exists (select 1 from public.follows f where f.followee_id = p.id and f.follower_id = auth.uid())
  from public.profiles p
  where p.is_creator and p.status = 'active' and not private.is_blocked(p.id, auth.uid())
    and (p.username ilike '%' || coalesce(p_query, '') || '%' or p.display_name ilike '%' || coalesce(p_query, '') || '%')
  order by 6 desc, p.username
  limit least(greatest(p_limit, 1), 50)
$$;

create or replace function public.search_public_stories(p_query text, p_limit integer default 20)
returns table (id uuid, user_id uuid, username text, display_name text, avatar_media_id uuid, caption text,
               media_kind text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_id, p.username, p.display_name, p.avatar_media_id, s.caption, s.media_kind, s.created_at
  from public.stories s join public.profiles p on p.id = s.user_id
  where s.audience = 'public' and s.deleted_at is null and s.removed_at is null and s.expires_at > now()
    and (p.username ilike '%' || coalesce(p_query, '') || '%' or s.caption ilike '%' || coalesce(p_query, '') || '%')
    and private.can_view_story(s.id, auth.uid())
  order by s.created_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

create or replace function public.profile_summary(p_username text)
returns table (id uuid, username text, display_name text, bio text, avatar_media_id uuid, cover_media_id uuid,
               is_private boolean, is_creator boolean, is_verified boolean, created_at timestamptz,
               score bigint, friend_count bigint, follower_count bigint, following_count bigint, post_count bigint,
               is_friend boolean, is_following boolean, request_status text, request_id uuid, mutual_count bigint,
               last_seen_at timestamptz, can_view_details boolean)
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
  select t.id, t.username, t.display_name, t.bio, t.avatar_media_id,
         case when rel.details then t.cover_media_id end,
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
         rel.details
  from t join rel on rel.id = t.id
$$;

-- -----------------------------------------------------------------------------
-- Media access. The API calls this before issuing a signed URL.
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
              where (p.avatar_media_id = m.id or p.cover_media_id = m.id)
                and ((p.status = 'active' and not private.is_blocked(p.id, p_user)) or private.is_admin('moderator', p_user))))
        or (m.purpose = 'group_avatar' and exists (
              select 1 from public.groups g where g.avatar_media_id = m.id and private.is_member(g.conversation_id, p_user)))
        or (m.purpose = 'message' and exists (
              select 1 from public.message_attachments a join public.messages msg on msg.id = a.message_id
              where a.media_id = m.id and msg.deleted_at is null and private.can_read_message(msg, p_user)))
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

create or replace function public.can_access_media(p_media_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.can_access_media(p_media_id, auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- Push dispatch: atomically claims unsent notifications so each one is pushed
-- at most once even if several workers race. Service role only.
-- -----------------------------------------------------------------------------
create or replace function public.claim_push_notifications(p_ids uuid[] default null, p_limit integer default 200)
returns table (id uuid, user_id uuid, type text, title text, body text, data jsonb, tokens text[])
language sql security definer set search_path = '' as $$
  with claimed as (
    update public.notifications n set push_sent_at = now()
    where n.id in (
      select x.id from public.notifications x
      join public.user_settings s on s.user_id = x.user_id
      where x.push_sent_at is null and x.read_at is null
        and x.created_at > now() - interval '15 minutes'
        and s.push_enabled
        and (p_ids is null or x.id = any (p_ids))
      order by x.created_at
      limit least(greatest(p_limit, 1), 1000)
      for update skip locked)
    returning n.id, n.user_id, n.type, n.title, n.body, n.data
  )
  select c.id, c.user_id, c.type, c.title, c.body, c.data,
         coalesce((select array_agg(ps.token) from public.push_subscriptions ps where ps.user_id = c.user_id), '{}')
  from claimed c
$$;

-- -----------------------------------------------------------------------------
-- Maintenance. Runs every minute via pg_cron (when available) and from the
-- Vercel cron route. Idempotent.
-- -----------------------------------------------------------------------------
create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_job bigint;
  v_today date := private.utc_today();
  v_expired_recipients integer;
  v_snap_media integer;
  v_messages integer;
  v_story_media integer;
  v_streaks_lost integer;
  v_reminders integer := 0;
  v_calls integer := 0;
  v_unsuspended integer;
  v_stale_uploads integer;
  rec record;
begin
  insert into public.job_runs (job, status) values ('maintenance', 'running') returning id into v_job;

  -- 1. Unopened snaps past their expiry.
  update public.snap_recipients sr set status = 'expired'
   from public.snaps s
   where s.id = sr.snap_id and sr.status = 'delivered' and s.expires_at <= now();
  get diagnostics v_expired_recipients = row_count;

  -- 2. Snap media no longer viewable by anyone -> delete.
  with done as (
    select s.id, s.media_id from public.snaps s
    where s.media_deleted_at is null and s.media_id is not null
      and (
        s.expires_at <= now() - interval '2 minutes'
        or not exists (
          select 1 from public.snap_recipients r
          where r.snap_id = s.id
            and (r.status = 'delivered'
                 or r.view_expires_at > now()
                 or (s.allow_replay and r.replay_count < 1 and r.opened_at > now() - interval '24 hours'))
        )
      )
  ), marked as (
    update public.snaps s set media_deleted_at = now() from done where s.id = done.id returning done.media_id
  )
  update public.media_assets m set status = 'pending_delete', delete_after = now()
   from marked where m.id = marked.media_id and m.status <> 'deleted';
  get diagnostics v_snap_media = row_count;

  -- 3. Disappearing chat messages.
  update public.media_assets m set status = 'pending_delete', delete_after = now()
   where m.id in (select a.media_id from public.message_attachments a join public.messages msg on msg.id = a.message_id
                  where msg.expires_at <= now())
     and not exists (select 1 from public.message_attachments a2 join public.messages msg2 on msg2.id = a2.message_id
                     where a2.media_id = m.id and (msg2.expires_at is null or msg2.expires_at > now()));
  delete from public.messages where expires_at <= now();
  get diagnostics v_messages = row_count;

  -- 4. Expired stories: delete media now, keep the row for 7 days of analytics.
  update public.media_assets m set status = 'pending_delete', delete_after = now()
   from public.stories s
   where s.media_id = m.id and m.status = 'ready' and (s.expires_at <= now() or s.deleted_at is not null or s.removed_at is not null);
  get diagnostics v_story_media = row_count;
  delete from public.stories where expires_at < now() - interval '7 days';

  -- 5. Streaks: mark lapsed streaks as lost (recoverable for 48h).
  update public.streaks set lost_count = count, lost_at = private.streak_expires_at(last_counted_day), count = 0, updated_at = now()
   where count > 0 and last_counted_day < v_today - 1;
  get diagnostics v_streaks_lost = row_count;

  -- 6. Streak reminders (< 4h left, someone has not snapped today).
  for rec in
    select s.*, pa.username as a_name, pb.username as b_name
    from public.streaks s
    join public.profiles pa on pa.id = s.user_a
    join public.profiles pb on pb.id = s.user_b
    where s.count >= 3 and s.last_counted_day = v_today - 1
      and private.streak_expires_at(s.last_counted_day) - now() < interval '4 hours'
      and s.reminder_sent_day is distinct from v_today
  loop
    perform private.notify(rec.user_a, 'streak_reminder', null, 'Your streak is ending',
      'Snap @' || rec.b_name || ' to keep your ' || rec.count || '-day streak',
      jsonb_build_object('url', '/camera?to=' || rec.user_b), 'streak', null, 'streak:' || rec.user_a || ':' || rec.user_b || ':' || v_today);
    perform private.notify(rec.user_b, 'streak_reminder', null, 'Your streak is ending',
      'Snap @' || rec.a_name || ' to keep your ' || rec.count || '-day streak',
      jsonb_build_object('url', '/camera?to=' || rec.user_a), 'streak', null, 'streak:' || rec.user_b || ':' || rec.user_a || ':' || v_today);
    update public.streaks set reminder_sent_day = v_today where user_a = rec.user_a and user_b = rec.user_b;
    v_reminders := v_reminders + 1;
  end loop;

  -- 7. Calls ringing for too long -> missed; zombie active calls -> ended.
  for rec in select id from public.calls where status = 'ringing' and created_at < now() - interval '45 seconds' loop
    update public.call_participants set status = 'left', left_at = now() where call_id = rec.id and status = 'joined';
    perform private.finish_call_if_empty(rec.id);
    v_calls := v_calls + 1;
  end loop;
  update public.calls set status = 'ended', ended_at = now()
   where status = 'active' and started_at < now() - interval '6 hours';

  -- 8. Location shares, suspensions, old notifications, abandoned uploads.
  delete from public.location_shares where expires_at < now() - interval '1 day';
  update public.profiles set status = 'active', suspended_until = null
   where status = 'suspended' and suspended_until < now();
  get diagnostics v_unsuspended = row_count;
  delete from public.notifications where created_at < now() - interval '90 days';
  update public.media_assets set status = 'pending_delete', delete_after = now()
   where status = 'pending' and created_at < now() - interval '24 hours';
  get diagnostics v_stale_uploads = row_count;
  delete from public.job_runs where started_at < now() - interval '30 days';

  update public.job_runs set status = 'succeeded', finished_at = now(), details = jsonb_build_object(
    'expired_snap_recipients', v_expired_recipients, 'snap_media_deleted', v_snap_media,
    'messages_expired', v_messages, 'story_media_deleted', v_story_media, 'streaks_lost', v_streaks_lost,
    'streak_reminders', v_reminders, 'calls_timed_out', v_calls, 'unsuspended', v_unsuspended,
    'stale_uploads', v_stale_uploads)
  where id = v_job;
  return (select details from public.job_runs where id = v_job);
end $$;

-- -----------------------------------------------------------------------------
-- Privilege hardening
-- Supabase grants EXECUTE on new functions to anon/authenticated by default.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on function private.notify(uuid, text, uuid, text, text, jsonb, text, uuid, text, boolean) from authenticated;
revoke execute on function private.award_score(uuid, text, integer, uuid, integer) from authenticated;
revoke execute on function private.post_message(uuid, uuid, text, text, jsonb, uuid, text, uuid[], boolean) from authenticated;
revoke execute on function private.system_message(uuid, uuid, text, text, jsonb) from authenticated;
revoke execute on function private.add_member(uuid, uuid, text) from authenticated;
revoke execute on function private.streak_touch(uuid, uuid) from authenticated;
revoke execute on function private.finish_call_if_empty(uuid) from authenticated;
revoke execute on function private.ensure_group_owner(uuid) from authenticated;
revoke execute on function private.admin_log(text, text, text, jsonb) from authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.check_username_available(text) to anon;
revoke execute on function public.run_maintenance() from authenticated;
revoke execute on function public.claim_push_notifications(uuid[], integer) from authenticated;

-- Anonymous visitors only need public settings + announcements.
revoke all on all tables in schema public from anon;
grant select on public.app_settings, public.announcements to anon;

-- Authenticated users read through RLS; every write goes through RPCs above
-- except the few self-service rows below.
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant update (theme, who_can_message, who_can_add, last_active_visibility, read_receipts, discoverable, show_score,
              story_default_audience, location_sharing, notification_prefs, push_enabled, email_security_alerts)
  on public.user_settings to authenticated;
grant delete on public.notifications, public.push_subscriptions to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: publication + private channel authorization (typing indicators).
-- Guarded so the migration also runs on plain Postgres for tests.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.messages, public.message_reactions, public.conversation_members, public.conversations,
      public.notifications, public.snap_recipients, public.calls, public.call_participants,
      public.friend_requests, public.location_shares, public.groups;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute $p$
      create policy "conversation members receive broadcasts" on realtime.messages
        for select to authenticated
        using (
          realtime.topic() like 'conv:%'
          and private.is_member(nullif(split_part(realtime.topic(), ':', 2), '')::uuid, (select auth.uid()))
        )
    $p$;
    execute $p$
      create policy "conversation members send broadcasts" on realtime.messages
        for insert to authenticated
        with check (
          realtime.topic() like 'conv:%'
          and private.is_member(nullif(split_part(realtime.topic(), ':', 2), '')::uuid, (select auth.uid()))
        )
    $p$;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- pg_cron (available on Supabase; enable it under Database -> Extensions).
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('quickchat-maintenance', '* * * * *', 'select public.run_maintenance()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;

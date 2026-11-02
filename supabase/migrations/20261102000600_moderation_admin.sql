-- =============================================================================
-- Quick Chat — reports, moderation, appeals, admin audit, jobs, errors.
--
-- Moderators never get direct read access to private messages. When a user
-- reports a message, the server snapshots exactly what the reporter could see
-- at that moment; moderators review that snapshot only.
-- =============================================================================

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.profiles (id) on delete set null,
  target_type     text not null check (target_type in ('user', 'message', 'story', 'post', 'comment', 'group')),
  target_id       uuid not null,
  target_user_id  uuid references public.profiles (id) on delete set null,
  reason          text not null check (reason in ('spam', 'harassment', 'hate', 'nudity', 'violence', 'self_harm',
                                                  'scam', 'impersonation', 'underage', 'other')),
  details         text not null default '' check (char_length(details) <= 1000),
  snapshot        jsonb not null default '{}'::jsonb,
  status          text not null default 'pending' check (status in ('pending', 'reviewing', 'actioned', 'dismissed')),
  assigned_to     uuid references public.profiles (id) on delete set null,
  resolved_by     uuid references public.profiles (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now()
);
create unique index reports_one_open_per_reporter
  on public.reports (reporter_id, target_type, target_id) where status in ('pending', 'reviewing');
create index reports_status_time on public.reports (status, created_at);
create index reports_target on public.reports (target_type, target_id);

create table public.moderation_actions (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid references public.reports (id) on delete set null,
  moderator_id   uuid references public.profiles (id) on delete set null,
  action         text not null check (action in ('dismiss', 'warn', 'remove_content', 'suspend', 'ban', 'restore', 'restore_content')),
  target_type    text not null,
  target_id      uuid not null,
  target_user_id uuid references public.profiles (id) on delete cascade,
  reason         text not null default '',
  expires_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index moderation_actions_target_user on public.moderation_actions (target_user_id, created_at desc);

create table public.appeals (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  moderation_action_id uuid not null references public.moderation_actions (id) on delete cascade,
  message              text not null check (char_length(message) between 1 and 2000),
  status               text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  response             text,
  created_at           timestamptz not null default now(),
  unique (moderation_action_id, user_id)
);

create table public.admin_audit_logs (
  id          bigint generated always as identity primary key,
  admin_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb not null default '{}'::jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index admin_audit_logs_time on public.admin_audit_logs (created_at desc);

create table public.job_runs (
  id          bigint generated always as identity primary key,
  job         text not null,
  status      text not null check (status in ('running', 'succeeded', 'failed')),
  details     jsonb not null default '{}'::jsonb,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index job_runs_job_time on public.job_runs (job, started_at desc);

create table public.app_errors (
  id         bigint generated always as identity primary key,
  source     text not null,
  message    text not null,
  context    jsonb not null default '{}'::jsonb,
  user_id    uuid,
  created_at timestamptz not null default now()
);
create index app_errors_time on public.app_errors (created_at desc);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function private.request_ip()
returns text language sql stable as $$
  select nullif(split_part(coalesce(
    (nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), ''), ',', 1), '')
$$;

create or replace function private.admin_log(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details, ip)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb), private.request_ip());
$$;

create or replace function private.require_admin(p_min text default 'moderator')
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_admin(p_min, auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- -----------------------------------------------------------------------------
-- Reporting (any user)
-- -----------------------------------------------------------------------------
create or replace function public.create_report(p_target_type text, p_target_id uuid, p_reason text, p_details text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me       uuid := private.require_user();
  v_snapshot jsonb;
  v_owner    uuid;
  v_msg      public.messages;
  v_id       uuid;
begin
  if (select count(*) from public.reports where reporter_id = v_me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  case p_target_type
    when 'user' then
      select jsonb_build_object('username', username, 'display_name', display_name, 'bio', bio,
                                'media_ids', jsonb_build_array(avatar_media_id, cover_media_id)), id
        into v_snapshot, v_owner
      from public.profiles where id = p_target_id;
    when 'message' then
      select * into v_msg from public.messages where id = p_target_id;
      if v_msg.id is not null and private.can_read_message(v_msg, v_me) and v_msg.deleted_at is null
         and v_msg.sender_id is distinct from v_me then
        v_owner := v_msg.sender_id;
        v_snapshot := jsonb_build_object(
          'conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id, 'type', v_msg.type,
          'body', v_msg.body, 'metadata', v_msg.metadata, 'sent_at', v_msg.created_at,
          'media_ids', coalesce((select jsonb_agg(media_id) from public.message_attachments where message_id = v_msg.id), '[]'::jsonb));
      end if;
    when 'story' then
      if private.can_view_story(p_target_id, v_me) then
        select jsonb_build_object('user_id', user_id, 'caption', caption, 'media_kind', media_kind,
                                  'media_ids', jsonb_build_array(media_id), 'posted_at', created_at), user_id
          into v_snapshot, v_owner
        from public.stories where id = p_target_id;
      end if;
    when 'post' then
      if private.can_view_post(p_target_id, v_me) then
        select jsonb_build_object('author_id', author_id, 'caption', caption, 'media_kind', media_kind,
                                  'media_ids', jsonb_build_array(media_id), 'posted_at', created_at), author_id
          into v_snapshot, v_owner
        from public.posts where id = p_target_id;
      end if;
    when 'comment' then
      select jsonb_build_object('post_id', c.post_id, 'user_id', c.user_id, 'body', c.body, 'posted_at', c.created_at), c.user_id
        into v_snapshot, v_owner
      from public.post_comments c where c.id = p_target_id and c.status = 'active' and private.can_view_post(c.post_id, v_me);
    when 'group' then
      if private.is_member(p_target_id, v_me) then
        select jsonb_build_object('name', name, 'description', description, 'created_by', created_by,
                                  'media_ids', jsonb_build_array(avatar_media_id)), created_by
          into v_snapshot, v_owner
        from public.groups where conversation_id = p_target_id;
      end if;
    else
      raise exception 'invalid_target' using errcode = '22023';
  end case;

  if v_snapshot is null then
    raise exception 'target_not_found' using errcode = 'P0002';
  end if;
  if p_reason not in ('spam', 'harassment', 'hate', 'nudity', 'violence', 'self_harm', 'scam', 'impersonation', 'underage', 'other') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_user_id, reason, details, snapshot)
  values (v_me, p_target_type, p_target_id, v_owner, p_reason, left(coalesce(p_details, ''), 1000), v_snapshot)
  on conflict (reporter_id, target_type, target_id) where status in ('pending', 'reviewing') do nothing
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.submit_appeal(p_action_id uuid, p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  -- Suspended/banned users may still appeal, so do not use require_user().
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.moderation_actions where id = p_action_id and target_user_id = auth.uid()
                 and action in ('warn', 'remove_content', 'suspend', 'ban')) then
    raise exception 'action_not_found' using errcode = 'P0002';
  end if;
  insert into public.appeals (user_id, moderation_action_id, message)
  values (auth.uid(), p_action_id, left(p_message, 2000))
  returning id into v_id;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Admin RPCs (every one checks role server-side and writes an audit entry)
-- -----------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'total_users',      (select count(*) from public.profiles),
    'active_users',     (select count(*) from public.profiles where status = 'active'),
    'suspended_users',  (select count(*) from public.profiles where status in ('suspended', 'banned')),
    'new_users_7d',     (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_users_today',  (select count(*) from public.profiles where created_at > date_trunc('day', now())),
    'dau',              (select count(*) from public.user_presence where last_seen_at > now() - interval '1 day'),
    'mau',              (select count(*) from public.user_presence where last_seen_at > now() - interval '30 days'),
    'total_messages',   (select count(*) from public.messages),
    'messages_24h',     (select count(*) from public.messages where created_at > now() - interval '1 day'),
    'active_stories',   (select count(*) from public.stories where deleted_at is null and expires_at > now()),
    'total_stories',    (select count(*) from public.stories),
    'total_snaps',      (select count(*) from public.snaps),
    'total_posts',      (select count(*) from public.posts where status = 'active'),
    'storage_bytes',    (select coalesce(sum(size_bytes), 0) from public.media_assets where status in ('ready', 'pending')),
    'storage_objects',  (select count(*) from public.media_assets where status in ('ready', 'pending')),
    'pending_deletes',  (select count(*) from public.media_assets where status = 'pending_delete'),
    'reports_pending',  (select count(*) from public.reports where status in ('pending', 'reviewing')),
    'appeals_pending',  (select count(*) from public.appeals where status = 'pending'),
    'active_calls',     (select count(*) from public.calls where status in ('ringing', 'active')),
    'errors_24h',       (select count(*) from public.app_errors where created_at > now() - interval '1 day'),
    'last_maintenance', (select jsonb_build_object('status', status, 'finished_at', finished_at, 'details', details)
                         from public.job_runs where job = 'maintenance' order by started_at desc limit 1),
    'signups_by_day',   (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d), '[]'::jsonb) from (
                           select date_trunc('day', created_at)::date d, count(*) c from public.profiles
                           where created_at > now() - interval '30 days' group by 1) t),
    'messages_by_day',  (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d), '[]'::jsonb) from (
                           select date_trunc('day', created_at)::date d, count(*) c from public.messages
                           where created_at > now() - interval '14 days' group by 1) t)
  );
end $$;

create or replace function public.admin_search_users(p_query text default '', p_status text default null,
                                                     p_limit integer default 25, p_offset integer default 0)
returns table (id uuid, username text, display_name text, avatar_media_id uuid, status text, suspended_until timestamptz,
               created_at timestamptz, last_seen_at timestamptz, role text, report_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select p.id, p.username, p.display_name, p.avatar_media_id, p.status, p.suspended_until, p.created_at,
         pr.last_seen_at, ar.role,
         (select count(*) from public.reports r where r.target_user_id = p.id)
  from public.profiles p
  left join public.user_presence pr on pr.user_id = p.id
  left join public.admin_roles ar on ar.user_id = p.id
  where (coalesce(p_query, '') = '' or p.username ilike '%' || p_query || '%' or p.display_name ilike '%' || p_query || '%'
         or p.id::text = p_query)
    and (p_status is null or p.status = p_status)
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text, p_days integer default null,
                                                        p_report_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_admin  uuid := private.require_admin(case when p_status = 'banned' then 'admin' else 'moderator' end);
  v_action uuid;
begin
  if p_status not in ('active', 'suspended', 'banned') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if p_user_id = v_admin then
    raise exception 'cannot_moderate_self' using errcode = '42501';
  end if;
  if exists (select 1 from public.admin_roles where user_id = p_user_id) and not private.is_admin('super_admin', v_admin) then
    raise exception 'cannot_moderate_admin' using errcode = '42501';
  end if;
  if p_status = 'suspended' and (p_days is null or p_days not between 1 and 365) then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  update public.profiles
     set status = p_status,
         suspended_until = case when p_status = 'suspended' then now() + make_interval(days => p_days) end
   where id = p_user_id;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  insert into public.moderation_actions (report_id, moderator_id, action, target_type, target_id, target_user_id, reason, expires_at)
  values (p_report_id, v_admin,
          case p_status when 'active' then 'restore' when 'suspended' then 'suspend' else 'ban' end,
          'user', p_user_id, p_user_id, coalesce(p_reason, ''),
          case when p_status = 'suspended' then now() + make_interval(days => p_days) end)
  returning id into v_action;
  perform private.admin_log('user.' || p_status, 'user', p_user_id::text,
    jsonb_build_object('reason', p_reason, 'days', p_days, 'report_id', p_report_id));
  perform private.notify(p_user_id, 'moderation', null,
    case p_status when 'active' then 'Account restored' when 'suspended' then 'Account suspended' else 'Account banned' end,
    coalesce(nullif(p_reason, ''), 'A moderator updated your account status.'),
    jsonb_build_object('url', '/settings/account', 'action_id', v_action), 'moderation_action', v_action);
  return v_action;
end $$;

create or replace function public.admin_remove_content(p_target_type text, p_target_id uuid, p_reason text,
                                                       p_report_id uuid default null, p_restore boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_admin  uuid := private.require_admin();
  v_owner  uuid;
  v_action uuid;
  v_ok     boolean;
begin
  case p_target_type
    when 'story' then
      update public.stories set removed_at = case when p_restore then null else now() end
       where id = p_target_id returning user_id into v_owner;
      v_ok := found;
    when 'post' then
      update public.posts set status = case when p_restore then 'active' else 'removed' end
       where id = p_target_id and status <> 'deleted' returning author_id into v_owner;
      v_ok := found;
    when 'comment' then
      update public.post_comments set status = case when p_restore then 'active' else 'removed' end
       where id = p_target_id and status <> 'deleted' returning user_id into v_owner;
      v_ok := found;
    when 'message' then
      if p_restore then
        raise exception 'cannot_restore_message' using errcode = '22023';
      end if;
      -- Only messages that were reported may be acted upon.
      if not exists (select 1 from public.reports where target_type = 'message' and target_id = p_target_id) then
        raise exception 'message_not_reported' using errcode = '42501';
      end if;
      update public.messages set deleted_at = now(), body = null, metadata = jsonb_build_object('removed_by_moderation', true)
       where id = p_target_id returning sender_id into v_owner;
      v_ok := found;
      update public.media_assets set status = 'pending_delete', delete_after = now()
       where id in (select media_id from public.message_attachments where message_id = p_target_id);
      delete from public.message_attachments where message_id = p_target_id;
    when 'group' then
      if p_restore then
        raise exception 'cannot_restore_group' using errcode = '22023';
      end if;
      update public.groups set name = 'Removed group', description = '', avatar_media_id = null
       where conversation_id = p_target_id returning created_by into v_owner;
      v_ok := found;
    else
      raise exception 'invalid_target' using errcode = '22023';
  end case;
  if not v_ok then
    raise exception 'target_not_found' using errcode = 'P0002';
  end if;
  insert into public.moderation_actions (report_id, moderator_id, action, target_type, target_id, target_user_id, reason)
  values (p_report_id, v_admin, case when p_restore then 'restore_content' else 'remove_content' end,
          p_target_type, p_target_id, v_owner, coalesce(p_reason, ''))
  returning id into v_action;
  perform private.admin_log(case when p_restore then 'content.restore' else 'content.remove' end,
    p_target_type, p_target_id::text, jsonb_build_object('reason', p_reason, 'report_id', p_report_id));
  if not p_restore then
    perform private.notify(v_owner, 'moderation', null, 'Content removed',
      'Your ' || p_target_type || ' was removed for violating the community guidelines.',
      jsonb_build_object('url', '/settings/account', 'action_id', v_action), 'moderation_action', v_action);
  end if;
  return v_action;
end $$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_resolution text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin();
  v_report public.reports;
begin
  if p_resolution not in ('reviewing', 'actioned', 'dismissed') then
    raise exception 'invalid_resolution' using errcode = '22023';
  end if;
  update public.reports set
    status = p_resolution,
    assigned_to = coalesce(assigned_to, v_admin),
    resolved_by = case when p_resolution <> 'reviewing' then v_admin end,
    resolved_at = case when p_resolution <> 'reviewing' then now() end,
    resolution_note = nullif(p_note, '')
  where id = p_report_id
  returning * into v_report;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  if p_resolution = 'dismissed' then
    insert into public.moderation_actions (report_id, moderator_id, action, target_type, target_id, target_user_id, reason)
    values (p_report_id, v_admin, 'dismiss', v_report.target_type, v_report.target_id, v_report.target_user_id, coalesce(p_note, ''));
  end if;
  perform private.admin_log('report.' || p_resolution, 'report', p_report_id::text, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_warn_user(p_user_id uuid, p_reason text, p_report_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin();
  v_action uuid;
begin
  insert into public.moderation_actions (report_id, moderator_id, action, target_type, target_id, target_user_id, reason)
  values (p_report_id, v_admin, 'warn', 'user', p_user_id, p_user_id, coalesce(p_reason, ''))
  returning id into v_action;
  perform private.admin_log('user.warn', 'user', p_user_id::text, jsonb_build_object('reason', p_reason));
  perform private.notify(p_user_id, 'moderation', null, 'Community guidelines warning',
    coalesce(nullif(p_reason, ''), 'Please review our community guidelines.'),
    jsonb_build_object('url', '/settings/account', 'action_id', v_action), 'moderation_action', v_action);
  return v_action;
end $$;

create or replace function public.admin_review_appeal(p_appeal_id uuid, p_accept boolean, p_response text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin  uuid := private.require_admin();
  v_appeal public.appeals;
  v_action public.moderation_actions;
begin
  update public.appeals set status = case when p_accept then 'accepted' else 'rejected' end,
         reviewed_by = v_admin, reviewed_at = now(), response = nullif(p_response, '')
   where id = p_appeal_id and status = 'pending'
  returning * into v_appeal;
  if not found then
    raise exception 'appeal_not_found' using errcode = 'P0002';
  end if;
  select * into v_action from public.moderation_actions where id = v_appeal.moderation_action_id;
  if p_accept then
    if v_action.action in ('suspend', 'ban') then
      if v_action.action = 'ban' and not private.is_admin('admin', v_admin) then
        raise exception 'forbidden' using errcode = '42501';
      end if;
      update public.profiles set status = 'active', suspended_until = null where id = v_action.target_user_id;
    elsif v_action.action = 'remove_content' and v_action.target_type in ('story', 'post', 'comment') then
      perform public.admin_remove_content(v_action.target_type, v_action.target_id, 'Appeal accepted', v_action.report_id, true);
    end if;
  end if;
  perform private.admin_log('appeal.' || case when p_accept then 'accept' else 'reject' end, 'appeal', p_appeal_id::text,
    jsonb_build_object('response', p_response));
  perform private.notify(v_appeal.user_id, 'moderation', null,
    'Appeal ' || case when p_accept then 'accepted' else 'rejected' end,
    coalesce(nullif(p_response, ''), 'Your appeal has been reviewed.'),
    jsonb_build_object('url', '/settings/account'), 'appeal', p_appeal_id);
end $$;

create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin('super_admin');
begin
  if p_role is null then
    if p_user_id = v_admin then
      raise exception 'cannot_revoke_self' using errcode = '42501';
    end if;
    delete from public.admin_roles where user_id = p_user_id;
  else
    if p_role not in ('moderator', 'admin', 'super_admin') then
      raise exception 'invalid_role' using errcode = '22023';
    end if;
    insert into public.admin_roles (user_id, role, granted_by) values (p_user_id, p_role, v_admin)
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = now();
  end if;
  perform private.admin_log('role.set', 'user', p_user_id::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin('admin');
begin
  update public.app_settings set value = p_value, updated_by = v_admin, updated_at = now() where key = p_key;
  if not found then
    raise exception 'setting_not_found' using errcode = 'P0002';
  end if;
  perform private.admin_log('setting.update', 'setting', p_key, jsonb_build_object('value', p_value));
end $$;

create or replace function public.admin_save_announcement(p_id uuid, p_title text, p_body text, p_level text,
                                                          p_active boolean, p_ends_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin('admin');
  v_id uuid := p_id;
begin
  if v_id is null then
    insert into public.announcements (title, body, level, active, ends_at, created_by)
    values (p_title, coalesce(p_body, ''), p_level, p_active, p_ends_at, v_admin) returning id into v_id;
  else
    update public.announcements set title = p_title, body = coalesce(p_body, ''), level = p_level,
           active = p_active, ends_at = p_ends_at where id = v_id;
  end if;
  perform private.admin_log('announcement.save', 'announcement', v_id::text, jsonb_build_object('title', p_title, 'active', p_active));
  return v_id;
end $$;

create or replace function public.admin_delete_announcement(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin('admin');
  delete from public.announcements where id = p_id;
  perform private.admin_log('announcement.delete', 'announcement', p_id::text);
end $$;

-- Lets the admin UI record sensitive read access (e.g. viewing a user's
-- account activity) in the audit trail.
create or replace function public.admin_log_access(p_action text, p_target_type text, p_target_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  perform private.admin_log(left(p_action, 60), left(p_target_type, 40), left(p_target_id, 80));
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.reports            enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.appeals            enable row level security;
alter table public.admin_audit_logs   enable row level security;
alter table public.job_runs           enable row level security;
alter table public.app_errors         enable row level security;

create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));
create policy moderation_actions_select on public.moderation_actions for select to authenticated
  using (target_user_id = (select auth.uid()) or (select private.is_admin()));
create policy appeals_select on public.appeals for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy audit_select_admin on public.admin_audit_logs for select to authenticated
  using ((select private.is_admin('admin')));
create policy job_runs_select_admin on public.job_runs for select to authenticated
  using ((select private.is_admin()));
create policy app_errors_select_admin on public.app_errors for select to authenticated
  using ((select private.is_admin('admin')));

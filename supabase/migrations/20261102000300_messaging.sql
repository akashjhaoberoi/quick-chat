-- =============================================================================
-- Quick Chat — messaging: conversations, groups, members, messages,
-- attachments, reactions, pins, stars, read state, live location.
-- =============================================================================

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('direct', 'group')),
  -- "<smaller uuid>:<larger uuid>" for direct chats; guarantees one chat per pair.
  direct_key      text unique,
  created_by      uuid references public.profiles (id) on delete set null,
  disappear_mode  text not null default 'off' check (disappear_mode in ('off', '24h', '7d')),
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((type = 'direct') = (direct_key is not null))
);
create index conversations_last_message on public.conversations (last_message_at desc);
create trigger conversations_touch before update on public.conversations
  for each row execute function private.touch_updated_at();

create table public.groups (
  conversation_id   uuid primary key references public.conversations (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 60),
  description       text not null default '' check (char_length(description) <= 300),
  avatar_media_id   uuid references public.media_assets (id) on delete set null,
  only_admins_send  boolean not null default false,
  only_admins_edit  boolean not null default true,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index groups_name_trgm on public.groups using gin (name extensions.gin_trgm_ops);
create trigger groups_touch before update on public.groups
  for each row execute function private.touch_updated_at();

-- Membership facts visible to every member of the conversation.
create table public.conversation_members (
  conversation_id     uuid not null references public.conversations (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  role                text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at           timestamptz not null default now(),
  left_at             timestamptz,
  -- Only advanced when the member has read receipts enabled.
  last_read_public_at timestamptz,
  last_delivered_at   timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_members_user on public.conversation_members (user_id) where left_at is null;

-- Per-member private state, visible only to the member themself.
create table public.conversation_member_state (
  conversation_id uuid not null,
  user_id         uuid not null,
  last_read_at    timestamptz not null default now(),
  muted_until     timestamptz,
  archived_at     timestamptz,
  cleared_at      timestamptz,
  primary key (conversation_id, user_id),
  foreign key (conversation_id, user_id) references public.conversation_members (conversation_id, user_id) on delete cascade
);

-- "group_members" as requested by the spec: a view over group conversation members.
create view public.group_members with (security_invoker = true) as
  select m.conversation_id as group_id, m.user_id, m.role, m.joined_at
  from public.conversation_members m
  join public.conversations c on c.id = m.conversation_id
  where c.type = 'group' and m.left_at is null;

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid references public.profiles (id) on delete set null,
  type            text not null check (type in (
                    'text', 'image', 'video', 'voice', 'gif', 'sticker', 'document',
                    'location', 'contact', 'link', 'story_reply', 'system', 'call')),
  body            text check (char_length(body) <= 4000),
  metadata        jsonb not null default '{}'::jsonb,
  reply_to_id     uuid references public.messages (id) on delete set null,
  forwarded       boolean not null default false,
  client_id       text check (char_length(client_id) <= 64),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  expires_at      timestamptz,
  pinned_at       timestamptz,
  pinned_by       uuid references public.profiles (id) on delete set null,
  search_tsv      tsvector generated always as (to_tsvector('simple', coalesce(body, ''))) stored,
  created_at      timestamptz not null default now(),
  unique (sender_id, client_id)
);
create index messages_conversation_time on public.messages (conversation_id, created_at desc);
create index messages_sender_time on public.messages (sender_id, created_at desc);
create index messages_search on public.messages using gin (search_tsv);
create index messages_expiry on public.messages (expires_at) where expires_at is not null;
create index messages_pinned on public.messages (conversation_id) where pinned_at is not null;

create table public.message_attachments (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  media_id   uuid not null references public.media_assets (id) on delete cascade,
  position   smallint not null default 0,
  unique (message_id, media_id)
);
create index message_attachments_media on public.message_attachments (media_id);

-- One reaction per user per message. The composite PK means realtime DELETE
-- payloads (PK only under RLS) still carry message_id.
create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.message_hidden (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  primary key (user_id, message_id)
);

create table public.starred_messages (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create table public.location_shares (
  id              uuid primary key default gen_random_uuid(),
  sharer_id       uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  latitude        double precision not null check (latitude between -90 and 90),
  longitude       double precision not null check (longitude between -180 and 180),
  accuracy_m      double precision check (accuracy_m >= 0),
  expires_at      timestamptz not null,
  stopped_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index location_shares_conversation on public.location_shares (conversation_id, expires_at);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function private.is_member(p_conversation uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation and user_id = p_user and left_at is null
  )
$$;

create or replace function private.member_role(p_conversation uuid, p_user uuid default auth.uid())
returns text language sql stable security definer set search_path = '' as $$
  select role from public.conversation_members
  where conversation_id = p_conversation and user_id = p_user and left_at is null
$$;

create or replace function private.message_preview(p_type text, p_body text)
returns text language sql immutable as $$
  select case p_type
    when 'text'        then left(coalesce(p_body, ''), 120)
    when 'link'        then left(coalesce(p_body, ''), 120)
    when 'story_reply' then 'Replied to your story: ' || left(coalesce(p_body, ''), 80)
    when 'image'       then 'Sent a photo'
    when 'video'       then 'Sent a video'
    when 'voice'       then 'Sent a voice message'
    when 'gif'         then 'Sent a GIF'
    when 'sticker'     then 'Sent a sticker'
    when 'document'    then 'Sent a document'
    when 'location'    then 'Shared a location'
    when 'contact'     then 'Shared a contact'
    when 'call'        then 'Call'
    else coalesce(p_body, '')
  end
$$;

create or replace function private.can_message_direct(p_me uuid, p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active_user(p_other)
     and not private.is_blocked(p_me, p_other)
     and (
       private.are_friends(p_me, p_other)
       or coalesce((select who_can_message from public.user_settings where user_id = p_other), 'friends') = 'everyone'
     )
$$;

-- Core insert used by send_message / forward_message / system events.
-- Callers are responsible for validating media ownership.
create or replace function private.post_message(
  p_sender uuid, p_conversation uuid, p_type text, p_body text, p_metadata jsonb,
  p_reply_to uuid, p_client_id text, p_media_ids uuid[], p_forwarded boolean default false
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

  insert into public.messages (conversation_id, sender_id, type, body, metadata, reply_to_id, client_id, forwarded, expires_at)
  values (p_conversation, p_sender, p_type, nullif(p_body, ''), coalesce(p_metadata, '{}'::jsonb), p_reply_to, p_client_id,
          p_forwarded, v_expires)
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
          || private.message_preview(p_type, p_body),
        jsonb_build_object('url', '/chats/' || p_conversation, 'conversation_id', p_conversation),
        'conversation', p_conversation, 'msg:' || p_conversation, true);
    end if;
  end loop;

  return v_msg;
end $$;

create or replace function private.system_message(p_actor uuid, p_conversation uuid, p_event text, p_body text, p_extra jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  select private.post_message(p_actor, p_conversation, 'system', p_body,
    jsonb_build_object('event', p_event) || coalesce(p_extra, '{}'::jsonb), null, null, null);
$$;

create or replace function private.add_member(p_conversation uuid, p_user uuid, p_role text default 'member')
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.conversation_members (conversation_id, user_id, role, joined_at, last_delivered_at)
  values (p_conversation, p_user, p_role, now(), now())
  on conflict (conversation_id, user_id) do update
    set left_at = null, role = excluded.role, joined_at = now();
  insert into public.conversation_member_state (conversation_id, user_id, last_read_at)
  values (p_conversation, p_user, now())
  on conflict (conversation_id, user_id) do update set cleared_at = null, archived_at = null;
end $$;

-- -----------------------------------------------------------------------------
-- Conversation RPCs
-- -----------------------------------------------------------------------------
create or replace function public.get_or_create_direct_conversation(p_other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me  uuid := private.require_user();
  v_key text;
  v_id  uuid;
begin
  if p_other = v_me then
    raise exception 'cannot_message_self' using errcode = '22023';
  end if;
  v_key := least(v_me, p_other)::text || ':' || greatest(v_me, p_other)::text;
  select id into v_id from public.conversations where direct_key = v_key;
  if v_id is not null then
    return v_id;
  end if;
  if not private.can_message_direct(v_me, p_other) then
    raise exception 'cannot_message_user' using errcode = '42501';
  end if;
  insert into public.conversations (type, direct_key, created_by)
  values ('direct', v_key, v_me)
  on conflict (direct_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversations where direct_key = v_key;
    return v_id;
  end if;
  perform private.add_member(v_id, v_me);
  perform private.add_member(v_id, p_other);
  return v_id;
end $$;

create or replace function public.create_group(p_name text, p_member_ids uuid[], p_description text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me    uuid := private.require_user();
  v_id    uuid;
  v_name  text := trim(p_name);
  v_count integer;
  v_me_name text;
  m uuid;
begin
  if char_length(v_name) = 0 or char_length(v_name) > 60 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;
  select count(distinct x) into v_count from unnest(p_member_ids) x where x <> v_me;
  if v_count < 1 or v_count > 99 then
    raise exception 'invalid_member_count' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_member_ids) x where x <> v_me and not private.are_friends(v_me, x)) then
    raise exception 'members_must_be_friends' using errcode = '42501';
  end if;
  if (select count(*) from public.groups where created_by = v_me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.conversations (type, created_by) values ('group', v_me) returning id into v_id;
  insert into public.groups (conversation_id, name, description, created_by)
  values (v_id, v_name, left(coalesce(p_description, ''), 300), v_me);
  perform private.add_member(v_id, v_me, 'owner');
  select username into v_me_name from public.profiles where id = v_me;
  for m in select distinct x from unnest(p_member_ids) x where x <> v_me loop
    perform private.add_member(v_id, m);
    perform private.notify(m, 'group_invite', v_me, v_name, '@' || v_me_name || ' added you to the group',
      jsonb_build_object('url', '/chats/' || v_id), 'conversation', v_id, 'gi:' || v_id);
  end loop;
  perform private.system_message(v_me, v_id, 'created', 'created the group "' || v_name || '"');
  return v_id;
end $$;

create or replace function public.send_message(
  p_conversation_id uuid, p_type text, p_body text default null, p_metadata jsonb default '{}'::jsonb,
  p_reply_to uuid default null, p_client_id text default null, p_media_ids uuid[] default null
) returns public.messages language plpgsql security definer set search_path = '' as $$
declare
  v_me     uuid := private.require_user();
  v_media  integer := coalesce(array_length(p_media_ids, 1), 0);
  v_meta   jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_type not in ('text', 'image', 'video', 'voice', 'gif', 'sticker', 'document', 'location', 'contact', 'link', 'story_reply') then
    raise exception 'invalid_message_type' using errcode = '22023';
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

  return private.post_message(v_me, p_conversation_id, p_type, p_body, v_meta, p_reply_to, p_client_id, p_media_ids);
end $$;

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
  select array_agg(media_id order by position) into v_media from public.message_attachments where message_id = v_src.id;
  foreach v_target in array p_conversation_ids loop
    perform private.post_message(v_me, v_target, v_src.type, v_src.body, v_src.metadata - 'share_id', null, null, v_media, true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function private.can_read_message(p_msg public.messages, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_msg.expires_at is null or p_msg.expires_at > now())
     and exists (
       select 1 from public.conversation_members m
       left join public.conversation_member_state st
         on st.conversation_id = m.conversation_id and st.user_id = m.user_id
       where m.conversation_id = p_msg.conversation_id and m.user_id = p_user and m.left_at is null
         and p_msg.created_at >= m.joined_at
         and (st.cleared_at is null or p_msg.created_at > st.cleared_at))
     and not exists (select 1 from public.message_hidden h where h.message_id = p_msg.id and h.user_id = p_user)
$$;

create or replace function public.edit_message(p_message_id uuid, p_body text)
returns public.messages language plpgsql security definer set search_path = '' as $$
declare
  v_me  uuid := private.require_user();
  v_msg public.messages;
begin
  if char_length(trim(coalesce(p_body, ''))) = 0 or char_length(p_body) > 4000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  update public.messages set body = p_body, edited_at = now()
   where id = p_message_id and sender_id = v_me and deleted_at is null
     and type in ('text', 'link') and created_at > now() - interval '15 minutes'
  returning * into v_msg;
  if v_msg.id is null then
    raise exception 'cannot_edit_message' using errcode = '42501';
  end if;
  return v_msg;
end $$;

create or replace function public.delete_message(p_message_id uuid, p_for_everyone boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me  uuid := private.require_user();
  v_msg public.messages;
begin
  select * into v_msg from public.messages where id = p_message_id;
  if v_msg.id is null or not private.can_read_message(v_msg, v_me) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;

  if not p_for_everyone then
    insert into public.message_hidden (user_id, message_id) values (v_me, p_message_id) on conflict do nothing;
    return;
  end if;

  if v_msg.deleted_at is not null then
    return;
  end if;
  if not (v_msg.sender_id = v_me
          or (private.member_role(v_msg.conversation_id, v_me) in ('owner', 'admin')
              and (select type from public.conversations where id = v_msg.conversation_id) = 'group')) then
    raise exception 'cannot_delete_message' using errcode = '42501';
  end if;

  update public.media_assets set status = 'pending_delete', delete_after = now()
   where id in (select media_id from public.message_attachments where message_id = p_message_id)
     and not exists (
       select 1 from public.message_attachments a
       where a.media_id = media_assets.id and a.message_id <> p_message_id);
  delete from public.message_attachments where message_id = p_message_id;
  delete from public.message_reactions where message_id = p_message_id;
  delete from public.starred_messages where message_id = p_message_id;
  update public.messages
     set deleted_at = now(), body = null, metadata = '{}'::jsonb, pinned_at = null, pinned_by = null
   where id = p_message_id;
end $$;

create or replace function public.react_to_message(p_message_id uuid, p_emoji text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me  uuid := private.require_user();
  v_msg public.messages;
  v_existing text;
begin
  select * into v_msg from public.messages where id = p_message_id;
  if v_msg.id is null or v_msg.deleted_at is not null or not private.can_read_message(v_msg, v_me) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  select emoji into v_existing from public.message_reactions where message_id = p_message_id and user_id = v_me;
  if p_emoji is null or p_emoji = v_existing then
    delete from public.message_reactions where message_id = p_message_id and user_id = v_me;
    return null;
  end if;
  if char_length(p_emoji) > 16 then
    raise exception 'invalid_emoji' using errcode = '22023';
  end if;
  insert into public.message_reactions (message_id, user_id, emoji) values (p_message_id, v_me, p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  return p_emoji;
end $$;

create or replace function public.set_message_pinned(p_message_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me  uuid := private.require_user();
  v_msg public.messages;
  v_group public.groups;
begin
  select * into v_msg from public.messages where id = p_message_id;
  if v_msg.id is null or v_msg.deleted_at is not null or not private.can_read_message(v_msg, v_me) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  select * into v_group from public.groups where conversation_id = v_msg.conversation_id;
  if v_group.conversation_id is not null and v_group.only_admins_edit
     and private.member_role(v_msg.conversation_id, v_me) = 'member' then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_pinned and (select count(*) from public.messages
                   where conversation_id = v_msg.conversation_id and pinned_at is not null) >= 20 then
    raise exception 'too_many_pins' using errcode = '54000';
  end if;
  update public.messages
     set pinned_at = case when p_pinned then now() end, pinned_by = case when p_pinned then v_me end
   where id = p_message_id;
end $$;

create or replace function public.set_message_starred(p_message_id uuid, p_starred boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me  uuid := private.require_user();
  v_msg public.messages;
begin
  if not p_starred then
    delete from public.starred_messages where user_id = v_me and message_id = p_message_id;
    return;
  end if;
  select * into v_msg from public.messages where id = p_message_id;
  if v_msg.id is null or v_msg.deleted_at is not null or not private.can_read_message(v_msg, v_me) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  insert into public.starred_messages (user_id, message_id) values (v_me, p_message_id) on conflict do nothing;
end $$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  if not private.is_member(p_conversation_id, v_me) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  update public.conversation_member_state set last_read_at = now()
   where conversation_id = p_conversation_id and user_id = v_me;
  update public.conversation_members
     set last_delivered_at = now(),
         last_read_public_at = case
           when coalesce((select read_receipts from public.user_settings where user_id = v_me), true) then now()
           else last_read_public_at end
   where conversation_id = p_conversation_id and user_id = v_me;
  update public.notifications set read_at = now()
   where user_id = v_me and read_at is null
     and dedupe_key in ('msg:' || p_conversation_id, 'gi:' || p_conversation_id);
end $$;

create or replace function public.mark_delivered()
returns void language sql security definer set search_path = '' as $$
  update public.conversation_members set last_delivered_at = now()
  where user_id = auth.uid() and left_at is null;
$$;

create or replace function public.set_conversation_muted(p_conversation_id uuid, p_until timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.conversation_member_state set muted_until = p_until
   where conversation_id = p_conversation_id and user_id = private.require_user();
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.set_conversation_archived(p_conversation_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.conversation_member_state set archived_at = case when p_archived then now() end
   where conversation_id = p_conversation_id and user_id = private.require_user();
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
end $$;

-- "Delete conversation" for the current user: hides all history up to now.
create or replace function public.clear_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.conversation_member_state set cleared_at = now(), archived_at = null
   where conversation_id = p_conversation_id and user_id = private.require_user();
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.set_disappearing_mode(p_conversation_id uuid, p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
  v_role text := private.member_role(p_conversation_id, v_me);
  v_type text;
begin
  if p_mode not in ('off', '24h', '7d') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  select type into v_type from public.conversations where id = p_conversation_id;
  if v_role is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if v_type = 'group' and v_role = 'member' then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  update public.conversations set disappear_mode = p_mode where id = p_conversation_id;
  perform private.system_message(v_me, p_conversation_id, 'disappearing',
    case p_mode when 'off' then 'turned off disappearing messages'
                else 'set messages to disappear after ' || case p_mode when '24h' then '24 hours' else '7 days' end end,
    jsonb_build_object('mode', p_mode));
end $$;

-- -----------------------------------------------------------------------------
-- Group management
-- -----------------------------------------------------------------------------
create or replace function public.update_group(
  p_conversation_id uuid, p_name text default null, p_description text default null,
  p_avatar_media_id uuid default null, p_only_admins_send boolean default null, p_only_admins_edit boolean default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me    uuid := private.require_user();
  v_role  text := private.member_role(p_conversation_id, v_me);
  v_group public.groups;
begin
  select * into v_group from public.groups where conversation_id = p_conversation_id;
  if v_group.conversation_id is null or v_role is null then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  if v_role = 'member' and (v_group.only_admins_edit or p_only_admins_send is not null or p_only_admins_edit is not null) then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_avatar_media_id is not null and not exists (
       select 1 from public.media_assets where id = p_avatar_media_id and owner_id = v_me
         and status = 'ready' and kind = 'image' and purpose = 'group_avatar') then
    raise exception 'invalid_media' using errcode = '22023';
  end if;
  if p_name is not null and char_length(trim(p_name)) not between 1 and 60 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;
  update public.groups set
    name             = coalesce(trim(p_name), name),
    description      = coalesce(left(p_description, 300), description),
    avatar_media_id  = coalesce(p_avatar_media_id, avatar_media_id),
    only_admins_send = coalesce(p_only_admins_send, only_admins_send),
    only_admins_edit = coalesce(p_only_admins_edit, only_admins_edit)
  where conversation_id = p_conversation_id;
  if p_name is not null and trim(p_name) <> v_group.name then
    perform private.system_message(v_me, p_conversation_id, 'renamed', 'renamed the group to "' || trim(p_name) || '"');
  end if;
end $$;

create or replace function public.add_group_members(p_conversation_id uuid, p_user_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_me    uuid := private.require_user();
  v_role  text := private.member_role(p_conversation_id, v_me);
  v_group public.groups;
  v_count integer := 0;
  v_names text[] := '{}';
  v_me_name text;
  u uuid;
begin
  select * into v_group from public.groups where conversation_id = p_conversation_id;
  if v_group.conversation_id is null or v_role is null then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  if v_role = 'member' and v_group.only_admins_edit then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if (select count(*) from public.conversation_members where conversation_id = p_conversation_id and left_at is null)
     + coalesce(array_length(p_user_ids, 1), 0) > 100 then
    raise exception 'group_full' using errcode = '54000';
  end if;
  select username into v_me_name from public.profiles where id = v_me;
  for u in select distinct x from unnest(p_user_ids) x loop
    if private.are_friends(v_me, u) and not private.is_member(p_conversation_id, u) then
      perform private.add_member(p_conversation_id, u);
      perform private.notify(u, 'group_invite', v_me, v_group.name, '@' || v_me_name || ' added you to the group',
        jsonb_build_object('url', '/chats/' || p_conversation_id), 'conversation', p_conversation_id,
        'gi:' || p_conversation_id, true);
      v_names := v_names || (select username from public.profiles where id = u);
      v_count := v_count + 1;
    end if;
  end loop;
  if v_count > 0 then
    perform private.system_message(v_me, p_conversation_id, 'added', 'added @' || array_to_string(v_names, ', @'),
      jsonb_build_object('usernames', to_jsonb(v_names)));
  end if;
  return v_count;
end $$;

create or replace function private.ensure_group_owner(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_next uuid;
begin
  if exists (select 1 from public.conversation_members
             where conversation_id = p_conversation_id and role = 'owner' and left_at is null) then
    return;
  end if;
  select user_id into v_next from public.conversation_members
   where conversation_id = p_conversation_id and left_at is null
   order by (role = 'admin') desc, joined_at asc limit 1;
  if v_next is not null then
    update public.conversation_members set role = 'owner'
     where conversation_id = p_conversation_id and user_id = v_next;
  end if;
end $$;

create or replace function public.remove_group_member(p_conversation_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me     uuid := private.require_user();
  v_role   text := private.member_role(p_conversation_id, v_me);
  v_target text := private.member_role(p_conversation_id, p_user_id);
  v_name   text;
begin
  if p_user_id = v_me then
    perform public.leave_group(p_conversation_id);
    return;
  end if;
  if v_role is null or v_target is null
     or not exists (select 1 from public.groups where conversation_id = p_conversation_id) then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_role = 'member' or v_target = 'owner' or (v_role = 'admin' and v_target = 'admin') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  update public.conversation_members set left_at = now(), role = 'member'
   where conversation_id = p_conversation_id and user_id = p_user_id;
  select username into v_name from public.profiles where id = p_user_id;
  perform private.system_message(v_me, p_conversation_id, 'removed', 'removed @' || v_name,
    jsonb_build_object('user_id', p_user_id));
end $$;

create or replace function public.leave_group(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  if not exists (select 1 from public.groups where conversation_id = p_conversation_id)
     or not private.is_member(p_conversation_id, v_me) then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  perform private.system_message(v_me, p_conversation_id, 'left', 'left the group');
  update public.conversation_members set left_at = now(), role = 'member'
   where conversation_id = p_conversation_id and user_id = v_me;
  perform private.ensure_group_owner(p_conversation_id);
end $$;

create or replace function public.set_group_role(p_conversation_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me     uuid := private.require_user();
  v_role   text := private.member_role(p_conversation_id, v_me);
  v_target text := private.member_role(p_conversation_id, p_user_id);
begin
  if p_role not in ('admin', 'member', 'owner') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if v_role is null or v_target is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if p_role = 'owner' then
    if v_role <> 'owner' then
      raise exception 'owner_only' using errcode = '42501';
    end if;
    update public.conversation_members set role = 'admin' where conversation_id = p_conversation_id and user_id = v_me;
  elsif v_role = 'member' or v_target = 'owner' or (v_role = 'admin' and v_target = 'admin' and p_role = 'member') then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  update public.conversation_members set role = p_role
   where conversation_id = p_conversation_id and user_id = p_user_id;
end $$;

-- -----------------------------------------------------------------------------
-- Live location sharing (explicit, time-boxed, conversation-scoped)
-- -----------------------------------------------------------------------------
create or replace function public.start_location_share(
  p_conversation_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy double precision, p_minutes integer
) returns public.messages language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
  v_share public.location_shares;
begin
  if p_minutes not in (15, 60, 480) then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  if not private.is_member(p_conversation_id, v_me) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  update public.location_shares set stopped_at = now()
   where sharer_id = v_me and conversation_id = p_conversation_id and stopped_at is null;
  insert into public.location_shares (sharer_id, conversation_id, latitude, longitude, accuracy_m, expires_at)
  values (v_me, p_conversation_id, p_lat, p_lng, p_accuracy, now() + make_interval(mins => p_minutes))
  returning * into v_share;
  return private.post_message(v_me, p_conversation_id, 'location', null,
    jsonb_build_object('share_id', v_share.id, 'live', true, 'expires_at', v_share.expires_at,
                       'lat', p_lat, 'lng', p_lng), null, null, null);
end $$;

create or replace function public.update_location_share(p_share_id uuid, p_lat double precision, p_lng double precision, p_accuracy double precision)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.location_shares
     set latitude = p_lat, longitude = p_lng, accuracy_m = p_accuracy, updated_at = now()
   where id = p_share_id and sharer_id = private.require_user()
     and stopped_at is null and expires_at > now()
     and updated_at < now() - interval '3 seconds';
end $$;

create or replace function public.stop_location_share(p_share_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.location_shares set stopped_at = now()
  where id = p_share_id and sharer_id = auth.uid() and stopped_at is null;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.conversations             enable row level security;
alter table public.groups                    enable row level security;
alter table public.conversation_members      enable row level security;
alter table public.conversation_member_state enable row level security;
alter table public.messages                  enable row level security;
alter table public.message_attachments       enable row level security;
alter table public.message_reactions         enable row level security;
alter table public.message_hidden            enable row level security;
alter table public.starred_messages          enable row level security;
alter table public.location_shares           enable row level security;

create policy conversations_select_member on public.conversations for select to authenticated
  using (private.is_member(id, (select auth.uid())));

create policy groups_select_member on public.groups for select to authenticated
  using (private.is_member(conversation_id, (select auth.uid())));

create policy members_select_member on public.conversation_members for select to authenticated
  using (private.is_member(conversation_id, (select auth.uid())));

create policy member_state_select_own on public.conversation_member_state for select to authenticated
  using (user_id = (select auth.uid()));

create policy messages_select_member on public.messages for select to authenticated
  using (
    (expires_at is null or expires_at > now())
    and exists (
      select 1 from public.conversation_members m
      left join public.conversation_member_state st
        on st.conversation_id = m.conversation_id and st.user_id = m.user_id
      where m.conversation_id = messages.conversation_id
        and m.user_id = (select auth.uid())
        and m.left_at is null
        and messages.created_at >= m.joined_at
        and (st.cleared_at is null or messages.created_at > st.cleared_at))
    and not exists (
      select 1 from public.message_hidden h
      where h.message_id = messages.id and h.user_id = (select auth.uid()))
  );

create policy attachments_select on public.message_attachments for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));

create policy reactions_select on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));

create policy hidden_select_own on public.message_hidden for select to authenticated
  using (user_id = (select auth.uid()));

create policy starred_select_own on public.starred_messages for select to authenticated
  using (user_id = (select auth.uid()));

create policy location_shares_select on public.location_shares for select to authenticated
  using (
    sharer_id = (select auth.uid())
    or (stopped_at is null and expires_at > now()
        and private.is_member(conversation_id, (select auth.uid()))
        and not private.is_blocked(sharer_id, (select auth.uid())))
  );

-- =============================================================================
-- Quick Chat — social UI helpers.
-- my_friend_requests(): pending incoming + outgoing requests with the other
-- person's public card and the mutual-friend count, in one round trip (avoids
-- an N+1 of mutual_friends() calls from the Friends > Requests screen).
-- =============================================================================

create or replace function public.my_friend_requests()
returns table (
  id uuid, direction text, created_at timestamptz,
  user_id uuid, username text, display_name text, avatar_media_id uuid, is_verified boolean,
  mutual_count bigint
) language sql stable security definer set search_path = '' as $$
  select fr.id,
         case when fr.receiver_id = auth.uid() then 'incoming' else 'outgoing' end,
         fr.created_at,
         p.id, p.username, p.display_name, p.avatar_media_id, p.is_verified,
         (select count(*) from private.friend_ids(p.id) a where a in (select private.friend_ids(auth.uid())))
  from public.friend_requests fr
  join public.profiles p
    on p.id = case when fr.receiver_id = auth.uid() then fr.sender_id else fr.receiver_id end
  where auth.uid() is not null
    and fr.status = 'pending'
    and (fr.sender_id = auth.uid() or fr.receiver_id = auth.uid())
    and p.status = 'active'
    and not private.is_blocked(p.id, auth.uid())
  order by fr.created_at desc
  limit 500
$$;

revoke execute on function public.my_friend_requests() from public, anon;
grant execute on function public.my_friend_requests() to authenticated, service_role;

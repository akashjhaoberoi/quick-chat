-- =============================================================================
-- Live location: adds "Until I stop" (1440 minutes). Sharing still ends
-- automatically after 24 hours so access can never outlive the sharer's intent.
-- =============================================================================
create or replace function public.start_location_share(
  p_conversation_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy double precision, p_minutes integer
) returns public.messages language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
  v_share public.location_shares;
begin
  if p_minutes not in (15, 60, 480, 1440) then
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

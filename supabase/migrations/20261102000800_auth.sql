-- =============================================================================
-- Quick Chat — auth hardening
--
-- Registration can be closed by an administrator (app_settings
-- 'registration_open' = false). The sign-up form hides itself in that case,
-- but sign-up requests go straight to Supabase Auth, so the rule is enforced
-- here: creating a new auth user fails while registration is closed. This
-- covers email/password sign-ups and first-time OAuth sign-ins alike.
-- Existing users can still sign in.
-- =============================================================================

create or replace function private.enforce_registration_open()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_open jsonb;
begin
  select value into v_open from public.app_settings where key = 'registration_open';
  if v_open is not null and v_open = 'false'::jsonb then
    raise exception 'registration_closed' using errcode = '42501';
  end if;
  return new;
end $$;

revoke execute on function private.enforce_registration_open() from public, anon, authenticated;

create trigger enforce_registration_open
  before insert on auth.users
  for each row execute function private.enforce_registration_open();

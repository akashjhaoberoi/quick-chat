-- =============================================================================
-- App themes (Theme Store). Additive only.
--
-- user_settings.app_theme stores the chosen app-wide theme. 'classic' is free
-- (Classic Light / Midnight Dark via user_settings.theme); every other theme
-- needs the 'profile_themes' entitlement, which is checked here on write AND
-- on read, so a lapsed subscription falls back to 'classic' without losing
-- the stored choice. Clients cannot write the column directly (no column
-- grant); they must go through set_app_theme().
-- =============================================================================

alter table public.user_settings
  add column if not exists app_theme text not null default 'classic'
    check (app_theme in ('classic', 'premium-gold', 'royal-purple', 'ocean-blue', 'rose-burgundy',
                         'sunset-orange', 'emerald-green', 'neon-cyber', 'minimal-white'));

-- Effective theme for the signed-in user.
create or replace function public.my_app_theme()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when s.app_theme = 'classic' or private.has_entitlement(s.user_id, 'profile_themes')
                 then s.app_theme else 'classic' end
     from public.user_settings s
     where s.user_id = auth.uid()),
    'classic')
$$;

create or replace function public.set_app_theme(p_theme text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_user();
begin
  if p_theme is null or p_theme not in ('classic', 'premium-gold', 'royal-purple', 'ocean-blue', 'rose-burgundy',
                                         'sunset-orange', 'emerald-green', 'neon-cyber', 'minimal-white') then
    raise exception 'invalid_theme' using errcode = '22023';
  end if;
  if p_theme <> 'classic' and not private.has_entitlement(v_me, 'profile_themes') then
    raise exception 'premium_required' using errcode = '42501';
  end if;
  update public.user_settings set app_theme = p_theme where user_id = v_me;
  return p_theme;
end $$;

revoke execute on function public.my_app_theme() from public, anon;
revoke execute on function public.set_app_theme(text) from public, anon;
grant execute on function public.my_app_theme() to authenticated, service_role;
grant execute on function public.set_app_theme(text) to authenticated, service_role;

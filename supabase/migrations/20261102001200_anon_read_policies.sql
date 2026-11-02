-- Anonymous visitors could not read public settings or announcements: the
-- shared policies called private.is_admin(), which anon may not execute (and
-- the private schema isn't usable by anon). Postgres evaluates that sub-select
-- even when the other OR branch is true, so every anon read failed with 42501.
-- Split each policy by role so anon never touches the private schema.

drop policy if exists app_settings_select_public on public.app_settings;
create policy app_settings_select_anon on public.app_settings for select to anon
  using (is_public);
create policy app_settings_select_auth on public.app_settings for select to authenticated
  using (is_public or (select private.is_admin()));

drop policy if exists announcements_select_active on public.announcements;
create policy announcements_select_anon on public.announcements for select to anon
  using (active and starts_at <= now() and (ends_at is null or ends_at > now()));
create policy announcements_select_auth on public.announcements for select to authenticated
  using ((active and starts_at <= now() and (ends_at is null or ends_at > now())) or (select private.is_admin()));

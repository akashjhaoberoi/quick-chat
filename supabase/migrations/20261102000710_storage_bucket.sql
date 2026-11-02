-- =============================================================================
-- Quick Chat — private Supabase Storage bucket (fallback when Cloudflare R2 is
-- not configured). The bucket is private and has NO storage.objects policies
-- for end users: objects are only written through signed upload URLs issued
-- by the server and read through short-lived signed URLs from /api/media/:id.
-- Guarded so the migration is a no-op on plain Postgres (tests).
-- =============================================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'media', 'media', false, 104857600,
      array[
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
        'video/mp4', 'video/webm', 'video/quicktime',
        'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav',
        'application/pdf', 'text/plain', 'application/zip',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]
    )
    on conflict (id) do update
      set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

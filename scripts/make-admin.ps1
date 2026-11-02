# Grants an admin role to an existing local Quick Chat user.
# Usage: npm run make-admin -- <username> [moderator|admin|super_admin]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9_.]{3,30}$')][string]$Username,
  [ValidateSet('moderator', 'admin', 'super_admin')][string]$Role = 'super_admin'
)
$ErrorActionPreference = "Stop"
$sql = "insert into public.admin_roles (user_id, role) select id, '$Role' from public.profiles where username = '$Username' on conflict (user_id) do update set role = excluded.role returning (select username from public.profiles where id = user_id) as username, role;"
$out = wsl -u root -e docker exec supabase_db_quick_chat psql -U postgres -tA -c $sql
if (-not $out -or $out -notmatch $Username) { throw "No user named '$Username'. Sign up at http://localhost:3000/register first." }
Write-Host "Done: $out. Sign out and back in, enable two-factor auth in Settings > Security, then open http://localhost:3000/admin"

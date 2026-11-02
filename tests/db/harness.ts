/**
 * Runs the real Supabase migrations inside PGlite (Postgres compiled to WASM)
 * with a minimal emulation of Supabase's auth schema, roles and default grants,
 * so RLS policies and RPCs are exercised exactly as they would be on Supabase.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "supabase", "migrations");

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create schema auth;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  user_agent text,
  ip text
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- Supabase's default privileges on the public schema.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createTestDb() {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_STUBS);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }

  let counter = 0;

  async function createUser(username?: string, meta: Record<string, unknown> = {}) {
    counter += 1;
    const name = username ?? `tester${counter}`;
    const res = await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [`${name}.${counter}@example.test`, JSON.stringify({ username: name, display_name: name, ...meta })],
    );
    const id = res.rows[0].id;
    await db.query(`update public.profiles set onboarded = true where id = $1`, [id]);
    return id;
  }

  /** Runs SQL as an end user with RLS enforced (null = anonymous visitor). */
  function as(userId: string | null) {
    const role = userId ? "authenticated" : "anon";
    const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
    return {
      async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
        await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
        await db.exec(`set role ${role}`);
        try {
          return (await db.query<T>(sql, params)).rows;
        } finally {
          await db.exec(`reset role`);
          await db.query(`select set_config('request.jwt.claims', '', false)`);
        }
      },
      async rpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown> = {}) {
        const keys = Object.keys(args);
        const sql = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
        return this.query<T>(sql, keys.map((k) => args[k]));
      },
    };
  }

  /** Superuser access (bypasses RLS) for arranging fixtures and asserting state. */
  async function admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return (await db.query<T>(sql, params)).rows;
  }

  async function makeFriends(a: string, b: string) {
    await admin(
      `insert into public.friendships (user_a, user_b)
       values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) on conflict do nothing`,
      [a, b],
    );
  }

  async function createMedia(owner: string, purpose: string, kind = "image", durationMs: number | null = null) {
    const rows = await admin<{ id: string }>(
      `insert into public.media_assets (owner_id, provider, object_key, kind, mime_type, size_bytes, purpose, status, ready_at, duration_ms)
       values ($1, 'supabase', $2, $3, $4, 1024, $5, 'ready', now(), $6) returning id`,
      [owner, `${owner}/${purpose}/${crypto.randomUUID()}`, kind, kind === "video" ? "video/mp4" : "image/jpeg", purpose, durationMs],
    );
    return rows[0].id;
  }

  return { db, createUser, as, admin, makeFriends, createMedia, close: () => db.close() };
}

/** Asserts that a database call fails with an error message containing `code`. */
export async function expectDbError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    const message = (error as Error).message;
    if (!message.includes(code)) {
      throw new Error(`Expected error containing "${code}" but got "${message}"`);
    }
    return;
  }
  throw new Error(`Expected error "${code}" but the call succeeded`);
}

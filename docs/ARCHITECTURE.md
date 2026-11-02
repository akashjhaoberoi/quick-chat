# Quick Chat — Architecture & Engineering Conventions

Quick Chat (by Akarika Technologies) is a Next.js 16 App Router application backed by Supabase
(Postgres + Auth + Realtime + Storage), with optional Cloudflare R2 (media), LiveKit (calls),
Firebase Cloud Messaging (push), Resend (email) and Redis (rate limiting).

## 1. Request flow

```
Browser ──reads──▶ Supabase (PostgREST/Realtime, anon key + user JWT, RLS enforced)
   │
   └──writes──▶ /api/* route handler (src/lib/api/handler.ts)
                   ├─ auth (JWT claims), admin role + MFA (aal2) for /api/admin
                   ├─ CSRF origin check, maintenance mode, rate limit, zod validation
                   └─▶ supabase.rpc(...)  ← user-scoped client, so auth.uid() = caller
                          └─ SECURITY DEFINER function validates permissions atomically
                             and creates notifications (private.notify)
                   └─▶ after(() => dispatchRecentPush())  ← FCM push, claimed once
```

* **Reads** go straight from the browser to Supabase with RLS (fast, realtime-capable) or
  through GET API routes when server-only data is required.
* **Writes** always go through `/api/*`. Tables have no INSERT/UPDATE/DELETE grants for
  `authenticated` (except a few self-service columns); every mutation is an RPC that checks
  `auth.uid()` itself. The API layer adds rate limiting, richer validation and push dispatch.
* **Internal helpers** live in the `private` schema, which PostgREST does not expose.

## 2. Directory layout

```
supabase/migrations/        SQL migrations (schema, RLS, RPCs, jobs) — source of truth
src/proxy.ts                Session refresh + route protection (Next 16 "proxy" = old middleware)
src/app/
  (app)/                    Authenticated app (AppShell: sidebar, bottom nav, realtime, call overlay)
  (auth)/                   Login, register, password reset, verify email
  admin/                    Separate protected admin dashboard
  api/                      REST API (route handlers)
src/components/
  ui/                       Design-system primitives (Button, Input/Field, Avatar, Dialog, Tabs, Switch, Menu, feedback)
  providers/                Theme, React Query, Session, Realtime
  shell/                    AppShell, nav items, PageHeader
  <feature>/                Feature components (chat, snaps, stories, calls, discover, …)
src/lib/
  api/handler.ts            Route wrapper: handler(), unwrap(), requireIntegration()
  api/errors.ts             ApiError + DB error → HTTP mapping
  api/client.ts             Browser fetch client (api.get/post/patch/delete)
  supabase/{client,server,admin,proxy}.ts
  storage.ts                R2 / Supabase Storage (signed upload + read URLs)
  upload.ts                 Browser uploader (compression, progress, cancel)
  media-rules.ts            Allowed MIME types, size limits, magic-byte sniffing
  push.ts / push-client.ts  FCM server dispatch / browser registration
  livekit.ts, email.ts, rate-limit.ts, env.ts, validation.ts, query-keys.ts, utils.ts
src/types/models.ts         Row/RPC result types
tests/db/                   PGlite tests running the real migrations with Supabase-like roles
tests/unit/                 Vitest unit tests
tests/e2e/                  Playwright tests
```

## 3. Conventions

### Next.js 16 specifics (read `node_modules/next/dist/docs/` when unsure)
* `cacheComponents` is on. Keep `page.tsx` files as thin **server components** that render a
  client component. Never read `cookies()`/`headers()` in pages or layouts.
* Any client component calling `useParams`, `useSearchParams` or `usePathname` must render
  under a `<Suspense>` boundary (otherwise the build fails for dynamic routes). Pattern:

  ```tsx
  // src/app/(app)/chats/[id]/page.tsx
  import { Suspense } from "react";
  import { ConversationView } from "@/components/chat/conversation-view";
  export default function Page() {
    return <Suspense fallback={<ListSkeleton />}><ConversationView /></Suspense>;
  }
  ```
* `middleware.ts` is now `src/proxy.ts`.

### Route handlers
```ts
export const POST = handler(
  { body: zodSchema, rateLimit: { name: "messages.send", limit: 30, window: 10 } },
  async ({ supabase, user, body, params, query }) => {
    const row = unwrap(await supabase.rpc("send_message", { ... }));
    after(() => dispatchRecentPush()); // when the RPC created notifications
    return row; // → { ok: true, data: row }
  },
);
```
* `auth` defaults to `"user"`; use `{ admin: "moderator" | "admin" | "super_admin" }` for admin
  routes, `"none"` for public, `"cron"` for scheduled jobs.
* Errors raised in SQL (`raise exception 'code' using errcode = '...'`) map to HTTP statuses
  automatically (`P0002`→404, `42501`→403, `54000`→429, `22023`→400, `23505`→409).
* Use the user-scoped `supabase` client so RLS and `auth.uid()` apply. Use
  `getSupabaseAdmin()` only for already-authorized server operations.

### Client data
* TanStack Query everywhere; keys from `src/lib/query-keys.ts`.
* Mutations via `api.post/patch/delete` inside `useMutation`; the global mutation cache shows a
  toast on error. Use optimistic updates with rollback for chat-like interactions.
* Realtime: never open ad-hoc `postgres_changes` channels — use
  `useRealtimeEvent(table, handler)` from the RealtimeProvider (one channel per user). Broadcast
  channels (typing) use private topics `conv:<conversationId>`, authorized by RLS on
  `realtime.messages`.

### UI
* Tokens: `bg-bg`, `bg-surface`, `bg-surface-2/3`, `border-border`, `text-ink`, `text-ink-2`,
  `text-muted`, `bg-brand`, `text-brand`, `bg-brand-soft`, `bg-accent`, `.brand-gradient`,
  `.brand-text`, `font-display`, shadows `shadow-[var(--shadow-soft)]` / `shadow-[var(--shadow-pop)]`.
* Always provide loading (skeleton), empty and error states. Icon-only buttons need `aria-label`.
* Optional integrations: check `useAppConfig().data?.features` and show `<SetupNotice>` instead
  of a broken control.

### Security rules
* Never trust client-side checks; the database is the authority.
* Never expose service-role/LiveKit/Firebase-admin secrets to the client.
* Never cache private media or API responses in the service worker.
* Render user content as text (React escapes it). Never use `dangerouslySetInnerHTML` with user data.

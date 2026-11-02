# Quick Chat — REST API

All endpoints live under `/api/*`, are implemented with the shared `handler()` wrapper
(`src/lib/api/handler.ts`) and return a JSON envelope:

```json
{ "ok": true,  "data": … }
{ "ok": false, "error": { "code": "rate_limited", "message": "…" } }
```

Common behaviour:

* **Auth** — Supabase session cookie. `401 unauthorized` when missing; suspended/banned users get `403`.
* **CSRF** — state-changing requests must be same-origin (`Origin` checked) → `403` otherwise.
* **Validation** — zod; `400 invalid_input` with field details.
* **Rate limits** — Redis (or in-memory fallback); `429 rate_limited` with `Retry-After`.
* **Maintenance mode** — non-admin writes return `503 maintenance`.
* **Caching** — every response is `Cache-Control: no-store`.
* Reads that don't need server logic are done directly from the browser against Supabase under RLS;
  these endpoints cover writes and aggregated reads.

## System
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | Public. DB reachability + which integrations are configured (no secrets). |
| GET | `/api/config` | Public. Feature flags, limits, announcements, maintenance state. |
| GET | `/api/cron/cleanup` | `Authorization: Bearer $CRON_SECRET`. Runs `run_maintenance`, deletes expired media, sends push. |

## Auth & account
| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/api/auth/username-available` | `?username=` (public) | `{username, available, reason?}` |
| POST | `/api/auth/session` | – | `{status, onboarded, reactivated, newDevice}` — records login, new-device alert |
| POST | `/api/auth/logout` | – | `{recorded}` |
| POST | `/api/auth/security-event` | `{event}` (mfa_enabled, mfa_disabled, password_changed, password_reset, session_revoked, email_changed) | `{recorded:true}` |
| GET | `/api/users/me` | – | `{user, profile, settings, adminRole}` |
| POST | `/api/users/me/onboarding` | `{username, displayName}` | profile |
| PATCH | `/api/profiles/me` | profile fields; `null` clears avatar/cover | profile |
| GET | `/api/profiles/{username}` | – | ProfileSummary / 404 |
| POST | `/api/account/deactivate` | – | `{deactivated:true}` (signs out everywhere) |
| DELETE | `/api/account` | `{confirmUsername}` | `{deleted:true, media}` (service role required) |
| GET / POST | `/api/appeals` | POST `{actionId, message}` | own appeals / `{id}` (409 `already_appealed`) |

## Friends & users
| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/api/friends` | – | `Friend[]` |
| DELETE | `/api/friends/{userId}` | – | `{removed:true}` |
| GET / POST | `/api/friends/requests` | POST `{userId}` | `{incoming, outgoing}` / `{status}` |
| POST / DELETE | `/api/friends/requests/{id}` | POST `{action: accept\|reject}` | `{status}` |
| GET | `/api/friends/suggestions` | `?limit` | suggestions with `mutual_count` |
| GET | `/api/friends/mutual/{userId}` | `?limit` | `UserCard[]` |
| GET / POST | `/api/friends/lists` | POST `{name, memberIds}` | lists / `{id}` (409 `list_name_taken`) |
| PUT / DELETE | `/api/friends/lists/{id}` | PUT `{name, memberIds}` | `{id}` / `{deleted:true}` |
| POST / DELETE | `/api/users/{id}/block` | – | `{blocked}` |
| GET | `/api/users/blocked` | – | blocked users |
| POST | `/api/users/{id}/follow` | – | `{following}` (toggle) |

## Chat
| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET / POST | `/api/conversations` | GET `?archived&limit&before`; POST `{type:"direct",userId}` or `{type:"group",name,memberIds,description?,avatarMediaId?}` | summaries / `{id}` |
| GET / PATCH / DELETE | `/api/conversations/{id}` | PATCH group fields; DELETE = clear history for me | details / `{ok}` |
| POST | `/api/conversations/{id}/members` | `{userIds}` | `{added}` |
| PATCH / DELETE | `/api/conversations/{id}/members/{userId}` | `{role}` / – | `{ok}` |
| POST | `/api/conversations/{id}/leave` · `/read` | – | `{ok}` |
| POST | `/api/conversations/{id}/mute` | `{until: ISO\|null}` | `{ok}` |
| POST | `/api/conversations/{id}/archive` | `{archived}` | `{ok}` |
| POST | `/api/conversations/{id}/disappearing` | `{mode: off\|24h\|7d}` | `{ok}` |
| GET | `/api/conversations/{id}/messages` | `?before&limit` or `?pinned=1` | `{messages, hasMore}` |
| GET | `/api/conversations/{id}/media` | `?limit` | shared media messages |
| POST | `/api/messages` | `{conversationId, clientId, type, body?, attachments?, replyToId?, metadata?}` (30 / 10 s) | ChatMessage (idempotent on `clientId`) |
| GET / PATCH / DELETE | `/api/messages/{id}` | PATCH `{body}`; DELETE `?scope=me\|everyone` | message / `{ok}` |
| POST | `/api/messages/{id}/reactions` | `{emoji\|null}` | `{emoji}` |
| POST | `/api/messages/{id}/pin` · `/star` | `{pinned}` / `{starred}` | `{ok}` |
| POST | `/api/messages/{id}/forward` | `{conversationIds}` (≤5) | `{count}` |
| GET | `/api/messages/search` | `?q&conversationId&offset` | hits |
| GET | `/api/messages/starred` | – | starred items |
| GET | `/api/messages/link-preview` | `?url` (SSRF-guarded) | `{url,title,description,domain}` |
| POST | `/api/location` | `{conversationId,lat,lng,accuracy?,minutes:15\|60\|480}` | ChatMessage |
| PATCH / DELETE | `/api/location/{id}` | `{lat,lng,accuracy?}` / – | `{ok}` |

## Media
| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| POST | `/api/media/upload-url` | `{purpose, mime, size, fileName?, width?, height?, durationMs?}` | `{id, upload}` (presigned R2 / Supabase Storage) |
| POST | `/api/media/{id}/complete` | – | media asset (server sniffs magic bytes; rejects mismatches) |
| GET | `/api/media/{id}` | `?variant` | `302` to a short-lived signed URL after `can_access_media` |

## Snaps, stories, streaks, score
| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET / POST | `/api/snaps` | GET `?box=inbox\|sent`; POST `{mediaId, recipientIds, durationSeconds, viewOnce, allowReplay, caption, overlays, expireHours}` | rows / `{id}` |
| POST | `/api/snaps/{id}/open` | `{replay?}` | media + view window (server-enforced) |
| POST | `/api/snaps/{id}/screenshot` | – | `{reported:true}` (best-effort) |
| GET / POST | `/api/stories` | POST `{mediaId, caption, overlays, audience, customIds?, friendListId?}` | feed / `{id}` |
| GET | `/api/stories/user/{userId}` | – | stories |
| DELETE | `/api/stories/{id}` | – | `{deleted:true}` |
| POST | `/api/stories/{id}/view` | – | `{viewed:true}` |
| POST | `/api/stories/{id}/react` | `{emoji\|null}` | `{emoji}` |
| GET | `/api/stories/{id}/viewers` | – | viewers (owner only) |
| POST | `/api/stories/{id}/reply` | `{body}` | `{conversationId, messageId}` |
| GET | `/api/streaks` | – | streaks |
| POST | `/api/streaks/{friendId}/recover` | – | `{count}` |
| GET | `/api/score` | – | `{score, history}` |

## Calls (LiveKit)
| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET / POST | `/api/calls` | GET `?before&limit`; POST `{conversationId, kind: audio\|video}` | history / Call (`503 not_configured` without LiveKit) |
| GET | `/api/calls/{id}` | – | `{call, participants, conversation}` |
| POST | `/api/calls/{id}/join` | – | `{token, url, call}` — token minted only after `join_call` |
| POST | `/api/calls/{id}/decline` · `/leave` | – | Call \| null |

## Discover
| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/api/discover` | `?mode&offset&tag` | `{items, nextOffset}` |
| POST | `/api/discover/posts` | `{mediaId, caption, visibility}` | `{id}` |
| GET / DELETE | `/api/discover/posts/{id}` | – | post / `{id}` |
| POST | `/api/discover/posts/{id}/like` · `/save` · `/view` · `/share` | – | `{liked}` / `{saved}` / `null` |
| GET / POST | `/api/discover/posts/{id}/comments` | POST `{body, parentId?}` | `{comments, total}` / comment |
| DELETE | `/api/discover/comments/{id}` | – | `{id}` |
| GET | `/api/discover/hashtags` · `/saved` · `/creators?q` | – | trending tags / saved posts / creators |

## Notifications & search
| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/api/notifications` | `?cursor&unread=1&limit` | `{items, actors, nextCursor}` |
| POST | `/api/notifications/read` | `{ids?}` (omit = all) | `{updated}` |
| DELETE | `/api/notifications/{id}` | – | `{deleted:true}` |
| POST / DELETE | `/api/notifications/push-subscriptions` | `{token, userAgent?}` / `{token}` | `{subscribed}` |
| GET | `/api/search` | `?type=all\|users\|groups\|messages\|creators\|stories\|posts\|hashtags&q&offset` | results |

## Moderation
| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| POST | `/api/reports` | `{targetType, targetId, reason, details?}` | `{id}` (server snapshots the content) |
| GET | `/api/reports` | – | own reports |

## Admin (`/api/admin/*`)
Every route requires an `admin_roles` row; with `ADMIN_REQUIRE_MFA=true` the session must be `aal2`
(`403 mfa_required`). Mutations go through role-checked RPCs and are written to `admin_audit_logs`.
Lists return `{items, offset, limit, total, hasMore}`.

| Method | Path | Body / query | Min role |
| --- | --- | --- | --- |
| GET | `/me` · `/stats` · `/jobs` | – | moderator |
| GET | `/users` | `q, status, offset` | moderator |
| GET | `/users/{id}` | – | moderator |
| POST | `/users/{id}/status` | `{status, reason, days?, reportId?}` (ban needs admin) | moderator |
| POST | `/users/{id}/warn` | `{reason, reportId?}` | moderator |
| POST | `/users/{id}/role` | `{role\|null}` | super_admin |
| GET | `/users/{id}/sessions` | – (audited) | admin |
| GET | `/reports` · `/reports/{id}` | `status, type, reason, offset` | moderator |
| POST | `/reports/{id}/resolve` | `{resolution, note}` | moderator |
| GET / POST | `/content` | `kind, state, offset` / `{targetType, targetId, reason, reportId?, restore?}` | moderator |
| GET / POST | `/appeals` · `/appeals/{id}` | `status, offset` / `{accept, response}` | moderator |
| GET | `/audit-logs` · `/errors` | filters | admin |
| GET / PATCH | `/settings` | `{key, value}` | admin |
| GET / POST / PUT / DELETE | `/announcements[/{id}]` | `{title, body, level, active, endsAt?}` | admin |
| POST | `/maintenance/run` | – | admin |

## Error codes (selection)
`unauthorized`, `forbidden`, `mfa_required`, `invalid_input`, `rate_limited`, `maintenance`,
`not_configured`, `not_found`, `user_not_found`, `requests_disabled`, `cannot_message_user`,
`already_appealed`, `list_name_taken`, `cannot_block_self`, `not_friends`. Database errors are mapped by
`fromDbError` in `src/lib/api/errors.ts`; internal details are never returned to clients.

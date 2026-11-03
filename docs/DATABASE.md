# Quick Chat — Database

PostgreSQL on Supabase. Source of truth: `supabase/migrations/` (apply in filename order).
Every `public` table has Row Level Security enabled; `authenticated` users can only **read**
through policies and **write** through RPCs (SECURITY DEFINER functions that validate
`auth.uid()`). Helpers live in the unexposed `private` schema.

## Migrations

| File | Contents |
| --- | --- |
| `…000100_foundation.sql` | profiles, user_settings, user_presence, user_scores, score_events, admin_roles, media_assets, notifications, push_subscriptions, user_sessions, app_settings, announcements; new-user trigger; profile RPCs; `private.notify` |
| `…000200_social.sql` | friend_requests, friendships, blocks, follows, friend_lists, friend_list_members; friend/block/follow RPCs; suggestions; presence privacy |
| `…000300_messaging.sql` | conversations, groups, conversation_members, conversation_member_state, `group_members` view, messages, message_attachments, message_reactions, message_hidden, starred_messages, location_shares; all chat RPCs |
| `…000400_snaps_stories_streaks.sql` | streaks, snaps, snap_recipients, stories, story_audience, story_views, story_reactions; score rules; snap open/replay windows; story audiences |
| `…000500_calls_discover.sql` | calls, call_participants (LiveKit signalling + history); posts, post_likes, post_comments, saved_posts, post_views; feed ranking |
| `…000600_moderation_admin.sql` | reports (with server-side snapshots), moderation_actions, appeals, admin_audit_logs, job_runs, app_errors; admin RPCs |
| `…000700_search_media_jobs_realtime.sql` | `my_conversations`, search RPCs, `profile_summary`, media access control, push claiming, `run_maintenance`, privilege hardening, realtime publication + channel authorization, pg_cron schedule |
| `…000710_storage_bucket.sql` | private `media` bucket (Supabase Storage fallback) |
| `…000800_auth.sql` | `auth.users` before-insert trigger that blocks sign-ups (incl. Google) while `registration_open` is false |
| `…001100_social_ui.sql` | `my_friend_requests()` — pending requests with profiles + mutual counts, block-aware |
| `…001200_anon_read_policies.sql` | Splits the public `app_settings`/`announcements` read policies by role so anonymous visitors never evaluate `private.is_admin()` (which they may not execute) |

## Entity overview

```
auth.users 1─1 profiles 1─1 user_settings / user_presence / user_scores
profiles ─< friend_requests >─ profiles        friendships (user_a < user_b)
profiles ─< blocks >─ profiles                 follows, friend_lists ─< friend_list_members
conversations 1─0..1 groups
conversations ─< conversation_members (public facts) ─1 conversation_member_state (private: read/mute/archive/clear)
conversations ─< messages ─< message_attachments >─ media_assets
messages ─< message_reactions, starred_messages, message_hidden
snaps ─< snap_recipients        streaks (user_a < user_b)      score_events
stories ─< story_audience, story_views, story_reactions
calls ─< call_participants
posts ─< post_likes, post_comments (threaded), saved_posts, post_views
reports ─< moderation_actions ─< appeals     admin_roles, admin_audit_logs
notifications, push_subscriptions, user_sessions, app_settings, announcements, job_runs, app_errors
```

## Key design decisions

* **One row per pair**: friendships/streaks store `(least, greatest)`; direct conversations have a
  unique `direct_key`; one pending friend request per unordered pair (partial unique index).
* **Private member state**: read position, mute, archive and "clear chat" live in
  `conversation_member_state` (owner-only RLS) so read receipts can be disabled without leaking
  the read position through the shared membership row.
* **Expiry in RLS**: messages (`expires_at`), snaps (`expires_at` + per-recipient
  `view_expires_at`) and stories (`expires_at`) are filtered by policies at read time; the
  maintenance job deletes them afterwards.
* **Idempotent messaging**: `unique (sender_id, client_id)` makes optimistic retries safe.
* **Notification de-duplication**: `unique (user_id, dedupe_key)`; chat messages re-arm a single
  per-conversation notification instead of creating one per message.
* **Reaction realtime**: composite PK `(message_id, user_id)` so realtime DELETE payloads (which
  carry only the primary key under RLS) still identify the message.
* **Search**: `pg_trgm` GIN indexes on usernames/display names/group names/captions; a generated
  `tsvector` column with a GIN index for message full-text search.

## Important indexes
`messages (conversation_id, created_at desc)`, `messages using gin (search_tsv)`,
`notifications (user_id, created_at desc)` + partial unread index, `snap_recipients (recipient_id, delivered_at desc)`,
`stories (user_id, created_at desc) where deleted_at is null`, `posts (created_at desc) where public & active`,
`posts using gin (hashtags)`, `friend_requests (receiver_id, status, created_at desc)`,
`calls (conversation_id) where status in ('ringing','active')` (unique — one live call per chat),
`media_assets (status) where status in ('pending','pending_delete')`.

## RPC catalogue (public)

| Area | Functions |
| --- | --- |
| Profile | `check_username_available`, `set_username`, `update_profile`, `complete_onboarding`, `heartbeat`, `set_account_active`, `profile_summary`, `mark_notifications_read` |
| Social | `send_friend_request`, `respond_friend_request`, `cancel_friend_request`, `remove_friend`, `block_user`, `unblock_user`, `my_blocked_users`, `my_friends`, `mutual_friends`, `friend_suggestions`, `get_presence`, `toggle_follow`, `save_friend_list`, `delete_friend_list` |
| Chat | `get_or_create_direct_conversation`, `create_group`, `send_message`, `forward_message`, `edit_message`, `delete_message`, `react_to_message`, `set_message_pinned`, `set_message_starred`, `mark_conversation_read`, `mark_delivered`, `set_conversation_muted`, `set_conversation_archived`, `clear_conversation`, `set_disappearing_mode`, `update_group`, `add_group_members`, `remove_group_member`, `leave_group`, `set_group_role`, `start_location_share`, `update_location_share`, `stop_location_share`, `my_conversations`, `search_messages` |
| Snaps & stories | `send_snap`, `open_snap`, `report_snap_screenshot`, `post_story`, `delete_story`, `record_story_view`, `react_to_story`, `story_viewers`, `stories_feed`, `user_stories`, `my_streaks`, `recover_streak`, `score_history` |
| Calls | `start_call`, `join_call`, `decline_call`, `leave_call`, `my_calls` |
| Discover | `create_post`, `delete_post`, `toggle_post_like`, `add_post_comment`, `delete_post_comment`, `toggle_saved_post`, `record_post_view`, `record_post_share`, `discover_feed`, `trending_hashtags` |
| Search | `search_users`, `search_groups`, `search_posts`, `search_creators`, `search_public_stories` |
| Media | `can_access_media` |
| Moderation | `create_report`, `submit_appeal` |
| Admin (role-checked, audited) | `admin_stats`, `admin_search_users`, `admin_set_user_status`, `admin_warn_user`, `admin_remove_content`, `admin_resolve_report`, `admin_review_appeal`, `admin_set_role`, `admin_update_setting`, `admin_save_announcement`, `admin_delete_announcement`, `admin_log_access` |
| Service role only | `run_maintenance`, `claim_push_notifications` |

## Snap score rules (server-side, `private.award_score`)
| Event | Points | Caps |
| --- | --- | --- |
| Snap sent | +1 per recipient | 10 per recipient per UTC day; 100/day total |
| Snap opened | +1 | 100/day |
| Story posted | +2 | 10/day |
| Streak day counted | +1 to both friends | 50/day |

Clients cannot write `user_scores`/`score_events`; `award_score` is not executable by users.

## Streak rules
A UTC day counts when both friends snap each other that day. Consecutive counted days extend the
streak; missing a full day ends it (a streak last counted on day *D* expires at 00:00 UTC on
*D+2*). Lost streaks of 3+ days can be recovered once per 30 days within 48 hours. Reminders are
sent when less than 4 hours remain.

## Retention
| Data | Retention |
| --- | --- |
| Unopened snaps | 1 h – 7 d (sender's choice); media deleted after expiry |
| Opened snaps | media deleted once every recipient's view window (and replay allowance) has passed |
| Stories | visible 24 h; media deleted on expiry; rows kept 7 more days for owner analytics |
| Disappearing chats | 24 h or 7 d from sending |
| Notifications | 90 days |
| Live locations | rows deleted 1 day after expiry |
| Abandoned uploads | 24 h |
| Job run logs | 30 days |

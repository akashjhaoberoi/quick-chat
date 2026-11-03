# Location Feature Report

**Date:** 4 Nov 2026

## Behaviour

- **Explicit consent:** location is read only when the user taps Share location → *Send current location* or a live duration. This uses the browser's Geolocation API, which asks for permission. Nothing is collected in the background, and nothing is shared automatically.
- **Static location:** a message with a map (OpenStreetMap embed) and an *Open in maps* link. The coordinates are in the link, so it works without any Maps API key.
- **Live location:**
  - Durations: 15 min, 1 hour, 8 hours or **Until I stop** (new). "Until I stop" ends automatically after 24 hours as a safety limit.
  - Updates every 10 s while Quick Chat is open.
  - The sender can stop at any time, and the recipient sees "Live location ended".
  - The recipient gets a chat notification.
- **Access:**
  - The `location_shares` table is readable only by members of that conversation (RLS).
  - Access ends when the share expires or is stopped.
  - Data travels over HTTPS and is stored in Supabase (encrypted at rest by the provider).
  - Locations are never public.

## Results (Chromium, real local stack, emulated geolocation)

| Test | Result |
|---|---|
| Permission denied → nothing sent, explained | PASS |
| Send static location → recipient sees it with a maps link | PASS |
| Four durations offered | PASS |
| Start live sharing (15 min) → recipient sees "Live location"; expiry about 15 min | PASS |
| Someone outside the chat can't read the share (RLS, real REST call) | PASS |
| Stop sharing → recipient sees it ended | PASS |
| "Until I stop" → 24 h limit; an expired share shows as ended | PASS |
| Real devices (iPhone, Android GPS) | NOT TESTED |

**File:** `tests/chat/location.spec.ts`.

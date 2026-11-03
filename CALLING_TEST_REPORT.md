# Calling Test Report

**Date:** 4 Nov 2026
**Environment:** local production build, real LiveKit Cloud, two Chromium browsers with Chromium's fake camera and microphone.

## What exists

The call features were already in the app:
- voice and video calls from chat headers;
- the incoming-call card;
- outgoing ringing;
- accept, decline and end;
- duration, missed calls and history;
- mute, camera on/off, switch camera, speaker choice and screen share;
- the network-quality indicator and reconnection;
- group audio and video calls.

LiveKit access tokens are minted on the server per call. The API secret never reaches the browser, and the tests check this.

## New in this round

- **Video effects** (local, on the outgoing camera track):
  - **Colour filters:** None, Natural, Brightness slider, Soft focus, Warm, Cool, Vintage, Black & white. These run through a WebGL shader at up to 720p and 30 fps.
  - **Background blur** and **virtual background**, using `@livekit/track-processors` and MediaPipe. The runtime and model are served from Quick Chat itself, not a CDN.
  - **Graceful fallbacks:** unsupported effects are hidden or explained, and low-power devices start with no background effect.
  - **Premium:** Vintage and Virtual background need Premium.
- **Incoming calls:** the overlay also re-checks every 15 s, in case a realtime update is missed.

## Results

| Test | Result |
|---|---|
| Start video call from chat → callee sees incoming call → accept → both connected with a running timer | PASS |
| Mute / unmute microphone | PASS |
| Camera off / on | PASS |
| Effects during the call (Warm, then None) | PASS |
| End call → other side sees it ended; call recorded with a start time | PASS |
| LiveKit secret never appears in API responses | PASS |
| Voice call declined by the callee → caller sees "Call declined" | PASS |
| No microphone permission → explained to the user | PASS |
| Reconnect after a network interruption | NOT TESTED (UI exists; not simulated) |
| Group calls | NOT TESTED this round |
| Background blur / virtual background in a live call | NOT TESTED (needs a real camera; fake video has no person to segment) |
| Switch camera, speaker selection | NOT TESTED (needs multiple real devices) |
| Safari / iOS, Brave | NOT TESTED (fake media flags are Chromium-only) |

**Files:** `tests/calls/calls.spec.ts`, `tests/calls/call-permissions.spec.ts`.

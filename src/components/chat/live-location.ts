"use client";

import { useSyncExternalStore } from "react";
import { api } from "@/lib/api/client";

/**
 * In-memory manager for the live location shares this tab is actively
 * updating. Positions are sent at most once every 10 s and only while the
 * share is active; it stops automatically at expiry. Nothing is persisted.
 */
export type ActiveShare = { shareId: string; conversationId: string; expiresAt: string; lastSentAt: number | null; error: string | null };

type Entry = ActiveShare & { watchId: number | null; timer: number | null };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: ActiveShare[] = [];
const EMPTY: ActiveShare[] = [];

function emit() {
  snapshot = Array.from(entries.values()).map(({ shareId, conversationId, expiresAt, lastSentAt, error }) => ({
    shareId,
    conversationId,
    expiresAt,
    lastSentAt,
    error,
  }));
  listeners.forEach((l) => l());
}

function clear(shareId: string) {
  const e = entries.get(shareId);
  if (!e) return;
  if (e.watchId !== null) navigator.geolocation.clearWatch(e.watchId);
  if (e.timer !== null) window.clearTimeout(e.timer);
  entries.delete(shareId);
  emit();
}

export const liveLocation = {
  start(shareId: string, conversationId: string, expiresAt: string) {
    if (typeof navigator === "undefined" || !navigator.geolocation || entries.has(shareId)) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    if (remaining <= 0) return;
    const entry: Entry = { shareId, conversationId, expiresAt, lastSentAt: null, error: null, watchId: null, timer: null };
    entries.set(shareId, entry);
    let inFlight = false;
    entry.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (inFlight || (entry.lastSentAt !== null && now - entry.lastSentAt < 10_000)) return;
        inFlight = true;
        entry.lastSentAt = now;
        api
          .patch(`/api/location/${shareId}`, { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
          .then(() => {
            entry.error = null;
          })
          .catch(() => {
            entry.error = "Couldn't update your location";
          })
          .finally(() => {
            inFlight = false;
            emit();
          });
      },
      (err) => {
        entry.error = err.code === err.PERMISSION_DENIED ? "Location permission was denied" : "Location unavailable";
        emit();
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    entry.timer = window.setTimeout(() => clear(shareId), remaining);
    emit();
  },
  async stop(shareId: string) {
    clear(shareId);
    await api.delete(`/api/location/${shareId}`);
  },
  isActive(shareId: string) {
    return entries.has(shareId);
  },
};

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useActiveShares(): ActiveShare[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

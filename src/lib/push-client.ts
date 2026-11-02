"use client";

import { isPushConfiguredClient, publicEnv } from "@/lib/env";
import { api } from "@/lib/api/client";

export type PushSupport = "unsupported" | "not_configured" | "denied" | "default" | "granted";

/**
 * Browser push support. Limitations: iOS Safari only supports web push for
 * apps added to the Home Screen (iOS 16.4+); some browsers block push in
 * private windows; delivery is best-effort and controlled by the browser.
 */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (!isPushConfiguredClient) return "not_configured";
  return Notification.permission as PushSupport;
}

/** Asks permission, obtains an FCM token bound to /sw.js and registers it with the server. */
export async function enablePush(): Promise<boolean> {
  if (pushSupport() === "unsupported" || pushSupport() === "not_configured") return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const registration = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, getToken } = await import("firebase/messaging");
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: publicEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: publicEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      messagingSenderId: publicEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: publicEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  const token = await getToken(getMessaging(app), {
    vapidKey: publicEnv.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return false;
  await api.post("/api/notifications/push-subscriptions", { token, userAgent: navigator.userAgent });
  try {
    localStorage.setItem("qc-push-token", token);
  } catch {
    // ignore
  }
  return true;
}

export async function disablePush(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem("qc-push-token");
    localStorage.removeItem("qc-push-token");
  } catch {
    // ignore
  }
  if (token) await api.delete("/api/notifications/push-subscriptions", { token });
}

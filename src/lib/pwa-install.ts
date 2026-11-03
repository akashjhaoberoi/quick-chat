"use client";

import { useSyncExternalStore } from "react";
import { INSTALL_EVENT as EVENT } from "./pwa-install-script";

/**
 * PWA install state.
 *
 * Chromium fires `beforeinstallprompt` once per page load, often before React
 * hydrates and usually on the landing or login page. `installCaptureScript`
 * (./pwa-install-script, inlined in the root layout <head>) stashes the event
 * on `window` so any component mounted later can still offer the prompt.
 */

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

declare global {
  interface Window {
    __qcInstallPrompt?: BeforeInstallPromptEvent | null;
    __qcInstalled?: boolean;
  }
}

/**
 * - `installed`: running as the installed app (or just installed).
 * - `prompt`: the browser offers a native install prompt (Chrome, Edge, Brave, Android).
 * - `ios`: iPhone/iPad Safari — Share → Add to Home Screen.
 * - `macos-safari`: Safari 17+ on macOS — File → Add to Dock.
 * - `unsupported`: no install path (e.g. Firefox desktop) — show nothing.
 */
export type InstallStatus = "installed" | "prompt" | "ios" | "macos-safari" | "unsupported";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detect(): InstallStatus {
  if (isStandalone() || window.__qcInstalled) return "installed";
  if (window.__qcInstallPrompt) return "prompt";
  const ua = navigator.userAgent;
  // iPadOS reports a desktop Mac user agent; touch support tells them apart.
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Firefox/.test(ua);
  if (safari && /Macintosh/.test(ua)) return "macos-safari";
  return "unsupported";
}

function subscribe(onChange: () => void) {
  const standalone = window.matchMedia("(display-mode: standalone)");
  window.addEventListener(EVENT, onChange);
  standalone.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    standalone.removeEventListener("change", onChange);
  };
}

export function useInstallStatus(): InstallStatus {
  return useSyncExternalStore(subscribe, detect, () => "unsupported");
}

/** Shows the browser's native install prompt. Must run from a user gesture. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = window.__qcInstallPrompt;
  if (!event) return "unavailable";
  // A prompt event can only be used once.
  window.__qcInstallPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") window.__qcInstalled = true;
  window.dispatchEvent(new Event(EVENT));
  return outcome;
}

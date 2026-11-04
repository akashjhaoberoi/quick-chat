"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { isAppThemeId, THEME_SCHEME, type AppThemeId } from "@/lib/app-themes";

export type ThemePreference = "system" | "light" | "dark";
const STORAGE_KEY = "qc-theme";
/** Last app theme confirmed by the server (or "classic" for guests); only used to avoid a flash before the server answers. */
const APP_THEME_KEY = "qc-app-theme";

type ThemeContextValue = {
  /** Light / Dark / System preference (used by the classic theme). */
  theme: ThemePreference;
  resolved: "light" | "dark";
  setTheme: (t: ThemePreference) => void;
  /** Applied app theme. Only set it to a value the server accepted. */
  appTheme: AppThemeId;
  setAppTheme: (t: AppThemeId) => void;
  /** Temporarily show a theme without saving it; null ends the preview. */
  preview: AppThemeId | null;
  setPreview: (t: AppThemeId | null) => void;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Inline script (in <head>) that applies the theme before first paint to avoid a flash. */
export const themeInitScript = `(function(){try{var s=${JSON.stringify(THEME_SCHEME)};var a=localStorage.getItem('${APP_THEME_KEY}');var t=localStorage.getItem('${STORAGE_KEY}')||'system';var e=document.documentElement;var d;if(a&&s[a]){e.setAttribute('data-theme',a);d=s[a]==='dark';}else{d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);}e.classList.toggle('dark',d);}catch(x){}})();`;

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(mode: ThemePreference, app: AppThemeId): "light" | "dark" {
  if (app !== "classic") return THEME_SCHEME[app];
  if (mode !== "system") return mode;
  return systemDark() ? "dark" : "light";
}

function read<T>(key: string, ok: (v: unknown) => v is T, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return ok(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
const isMode = (v: unknown): v is ThemePreference => v === "light" || v === "dark" || v === "system";

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode)
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const isClient = typeof window !== "undefined";
  const [theme, setThemeState] = useState<ThemePreference>(() => (isClient ? read(STORAGE_KEY, isMode, "system") : "system"));
  const [appTheme, setAppThemeState] = useState<AppThemeId>(() => (isClient ? read(APP_THEME_KEY, isAppThemeId, "classic") : "classic"));
  const [preview, setPreview] = useState<AppThemeId | null>(null);
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    isClient ? resolve(read(STORAGE_KEY, isMode, "system"), read(APP_THEME_KEY, isAppThemeId, "classic")) : "light",
  );

  const shown = preview ?? appTheme;

  useEffect(() => {
    const apply = () => {
      const r = resolve(theme, shown);
      setResolved(r);
      const el = document.documentElement;
      el.classList.toggle("dark", r === "dark");
      if (shown === "classic") el.removeAttribute("data-theme");
      else el.setAttribute("data-theme", shown);
      const bg = getComputedStyle(el).getPropertyValue("--bg").trim();
      if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, shown]);

  const setTheme = useCallback((t: ThemePreference) => {
    write(STORAGE_KEY, t);
    setThemeState(t);
  }, []);

  const setAppTheme = useCallback((t: AppThemeId) => {
    write(APP_THEME_KEY, t);
    setAppThemeState(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, appTheme, setAppTheme, preview, setPreview }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

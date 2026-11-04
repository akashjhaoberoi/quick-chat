"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crown, Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemePreference } from "@/components/providers/theme-provider";
import { useEntitlement } from "@/components/premium/use-premium";
import { api, errorMessage } from "@/lib/api/client";
import { THEME_CARDS, type AppThemeId, type ThemeCard } from "@/lib/app-themes";
import { cn } from "@/lib/utils";
import { useUpdateSettings } from "./settings-ui";

const APP_THEME_KEY = ["app-theme"] as const;

/**
 * Keeps the applied app theme in line with the server (signed-in users only).
 * The server returns "classic" when a premium theme is no longer entitled,
 * so a locally stored premium theme never outlives the subscription.
 */
export function AppThemeSync() {
  const { appTheme, setAppTheme } = useTheme();
  const query = useQuery({
    queryKey: APP_THEME_KEY,
    queryFn: () => api.get<{ theme: AppThemeId }>("/api/premium/app-theme"),
    staleTime: 5 * 60_000,
  });
  const serverTheme = query.data?.theme;
  useEffect(() => {
    if (serverTheme && serverTheme !== appTheme) setAppTheme(serverTheme);
  }, [serverTheme, appTheme, setAppTheme]);
  return null;
}

/** Theme actions shared by the gallery, the desktop header and the mobile menu. */
export function useThemeActions() {
  const { appTheme, setAppTheme, setTheme } = useTheme();
  const updateSettings = useUpdateSettings();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (theme: AppThemeId) => api.post<{ theme: AppThemeId }>("/api/premium/app-theme", { theme }),
    onSuccess: ({ theme }) => {
      setAppTheme(theme);
      qc.setQueryData(APP_THEME_KEY, { theme });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  /** Light / Dark / System. Picking a mode returns to the Classic theme. */
  const setMode = (mode: ThemePreference) => {
    setTheme(mode);
    updateSettings.mutate({ theme: mode });
    if (appTheme !== "classic") {
      setAppTheme("classic");
      save.mutate("classic");
    }
  };

  const applyCard = async (card: ThemeCard) => {
    if (card.mode) {
      setMode(card.mode);
      return true;
    }
    try {
      await save.mutateAsync(card.theme);
      toast.success(`${card.name} applied`);
      return true;
    } catch {
      return false;
    }
  };

  return { setMode, applyCard, saving: save.isPending ? save.variables : null };
}

function classicMode(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Miniature app screen drawn in the theme's own colours. */
function ThemePreviewArt({ card }: { card: ThemeCard }) {
  const [bg, surface, brand, accent, ink] = card.palette;
  return (
    <span aria-hidden className="flex h-28 flex-col gap-1.5 p-3" style={{ background: bg }}>
      <span className="flex items-center gap-1.5">
        <span className="h-4 w-4 rounded-full" style={{ background: brand }} />
        <span className="h-2 w-14 rounded-full opacity-80" style={{ background: ink }} />
      </span>
      <span className="flex items-center gap-1.5 rounded-lg p-1.5" style={{ background: surface }}>
        <span className="h-5 w-5 rounded-full" style={{ background: accent }} />
        <span className="flex flex-1 flex-col gap-1">
          <span className="h-1.5 w-3/4 rounded-full opacity-80" style={{ background: ink }} />
          <span className="h-1.5 w-1/2 rounded-full opacity-40" style={{ background: ink }} />
        </span>
      </span>
      <span className="mt-auto flex justify-end">
        <span className="h-5 w-20 rounded-xl rounded-br-sm" style={{ background: accent }} />
      </span>
    </span>
  );
}

/** Theme Store: preview, apply and unlock app themes. */
export function ThemeGallery() {
  const { theme, appTheme, preview, setPreview } = useTheme();
  const entitled = useEntitlement("profile_themes");
  const { applyCard, saving } = useThemeActions();

  // Leaving the page ends any preview.
  useEffect(() => () => setPreview(null), [setPreview]);

  const isCurrent = (c: ThemeCard) => (c.mode ? appTheme === "classic" && classicMode(theme) === c.mode : appTheme === c.theme);

  return (
    <div>
      {preview ? (
        <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-2.5 text-sm">
          <span>
            Previewing <strong>{THEME_CARDS.find((c) => c.theme === preview)?.name}</strong>. Nothing is saved until you apply it.
          </span>
          <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
            End preview
          </Button>
        </div>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {THEME_CARDS.map((card) => {
          const current = isCurrent(card);
          const locked = card.premium && !entitled;
          const previewing = preview === card.theme && !card.mode;
          return (
            <li
              key={card.key}
              className={cn(
                "overflow-hidden rounded-2xl border bg-surface transition-colors",
                current ? "border-brand ring-4 ring-[var(--ring)]" : "border-border",
              )}
            >
              <ThemePreviewArt card={card} />
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-bold">{card.name}</h3>
                  {card.premium ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
                      <Crown className="h-3 w-3" aria-hidden /> Premium
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">Free</span>
                  )}
                </div>
                <p className="text-xs text-muted">{card.description}</p>
                <div className="flex flex-wrap gap-1" aria-label="Colour palette">
                  {card.palette.map((c, i) => (
                    <span key={i} className="h-4 w-4 rounded-full border border-border" style={{ background: c }} title={c} />
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  {current ? (
                    <span className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-sm font-semibold">
                      <Check className="h-4 w-4" aria-hidden /> Current theme
                    </span>
                  ) : locked ? (
                    <Link
                      href="/premium"
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-bold text-brand-ink hover:brightness-95"
                    >
                      <Lock className="h-4 w-4" aria-hidden /> Unlock Premium
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1"
                      loading={saving === card.theme}
                      onClick={async () => {
                        if (await applyCard(card)) setPreview(null);
                      }}
                    >
                      Apply theme
                    </Button>
                  )}
                  {!card.mode && !current ? (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-pressed={previewing}
                      onClick={() => setPreview(previewing ? null : card.theme)}
                    >
                      {previewing ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                      {previewing ? "Stop" : "Preview"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!entitled ? (
        <p className="mt-3 text-xs text-muted">
          Premium themes are unlocked by an active Quick Chat Premium plan, checked on our server. Your choice is saved to your account and follows you
          to other devices.
        </p>
      ) : null}
    </div>
  );
}

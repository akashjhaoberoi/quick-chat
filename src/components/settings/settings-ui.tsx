"use client";

import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useMe, type Me } from "@/components/providers/session-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import type { UserSettings } from "@/types/models";

/** Columns users may update directly (column-level grant + RLS on user_settings). */
export type SettingsPatch = Partial<
  Pick<
    UserSettings,
    | "theme" | "who_can_message" | "who_can_add" | "last_active_visibility" | "read_receipts" | "discoverable" | "show_score"
    | "story_default_audience" | "location_sharing" | "notification_prefs" | "push_enabled" | "email_security_alerts"
  >
>;

/** Optimistic update of the signed-in user's settings row (rolls back on error). */
export function useUpdateSettings() {
  const me = useMe();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SettingsPatch) => {
      const { error } = await getSupabaseBrowserClient().from("user_settings").update(patch).eq("user_id", me.user.id);
      if (error) throw new Error(error.message || "Couldn't save your settings.");
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: qk.me });
      const prev = queryClient.getQueryData<Me | null>(qk.me);
      if (prev) queryClient.setQueryData<Me>(qk.me, { ...prev, settings: { ...prev.settings, ...patch } });
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(qk.me, ctx.prev);
    },
  });
}

export function SettingsSection({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)] sm:p-6", className)} aria-label={title}>
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export type ChoiceOption<T extends string> = { value: T; label: string; description?: string };

/** Accessible radio group rendered as selectable cards. */
export function ChoiceGroup<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="py-3" disabled={disabled}>
      <legend className="text-sm font-semibold">{label}</legend>
      {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      <div className={cn("mt-2.5 grid gap-2", options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative flex cursor-pointer flex-col rounded-2xl border px-3.5 py-2.5 transition-colors focus-within:ring-4 focus-within:ring-[var(--ring)]",
                active ? "border-brand bg-brand-soft" : "border-border hover:bg-surface-2",
              )}
            >
              <input type="radio" className="sr-only" name={label} value={o.value} checked={active} onChange={() => onChange(o.value)} />
              <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                {o.label}
                {active ? <Check className="h-4 w-4 text-brand" strokeWidth={3} aria-hidden /> : null}
              </span>
              {o.description ? <span className="mt-0.5 text-xs text-muted">{o.description}</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

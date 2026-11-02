"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Check, Loader2, X } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { usernameSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";

type Availability = { username: string; available: boolean; reason?: string };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Live username availability (debounced GET /api/auth/username-available).
 * Returns `ok` only when the latest value was confirmed available.
 */
export function useUsernameAvailability(raw: string) {
  const value = raw.trim().toLowerCase();
  const debounced = useDebounced(value, 400);
  const local = usernameSchema.safeParse(value);
  const query = useQuery({
    queryKey: ["username-available", debounced],
    enabled: debounced.length >= 3 && usernameSchema.safeParse(debounced).success,
    staleTime: 15_000,
    meta: { silent: true },
    queryFn: () => api.get<Availability>("/api/auth/username-available", { username: debounced }),
  });
  const settled = debounced === value;
  const localError = value && !local.success ? local.error.issues[0]?.message ?? "Invalid username" : null;
  const checking = Boolean(value) && !localError && (!settled || query.isFetching);
  const result = settled && !query.isFetching ? query.data : undefined;
  return {
    value,
    checking,
    error: localError ?? (result && !result.available ? result.reason ?? "Not available" : query.isError && settled ? "Couldn't check availability" : null),
    ok: Boolean(!localError && result?.available && result.username === value),
  };
}

export function UsernameField({
  value,
  onChange,
  availability,
  autoFocus,
  label = "Username",
}: {
  value: string;
  onChange: (v: string) => void;
  availability: ReturnType<typeof useUsernameAvailability>;
  autoFocus?: boolean;
  label?: string;
}) {
  const { checking, error, ok } = availability;
  return (
    <Field
      label={label}
      error={value ? error : null}
      hint={ok ? <span className="font-semibold text-success">@{availability.value} is available</span> : "3–20 characters: letters, numbers, _ and ."}
    >
      {(props) => (
        <div className="relative">
          <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            {...props}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\s/g, "").toLowerCase())}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            autoFocus={autoFocus}
            className={cn("pl-9 pr-10", ok && "border-success")}
            placeholder="yourname"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted" />
            ) : ok ? (
              <Check className="h-4 w-4 text-success" />
            ) : value && error ? (
              <X className="h-4 w-4 text-danger" />
            ) : null}
          </span>
        </div>
      )}
    </Field>
  );
}

"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSigningOut, signOutDevice } from "@/components/auth/auth-utils";
import { qk } from "@/lib/query-keys";
import type { Profile, UserSettings } from "@/types/models";

export type Me = {
  user: User;
  profile: Profile;
  settings: UserSettings;
  adminRole: "moderator" | "admin" | "super_admin" | null;
};

type SessionContextValue = {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function loadMe(): Promise<Me | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const [profile, settings, role] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).single(),
    supabase.from("user_settings").select("*").eq("user_id", auth.user.id).single(),
    supabase.from("admin_roles").select("role").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  if (profile.error || settings.error) throw new Error(profile.error?.message ?? settings.error?.message);
  return {
    user: auth.user,
    profile: profile.data as Profile,
    settings: settings.data as UserSettings,
    adminRole: (role.data?.role as Me["adminRole"]) ?? null,
  };
}

/** Current user, profile, settings and admin role for the authenticated app. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.me, queryFn: loadMe, staleTime: 60_000 });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const toLogin = () => {
      queryClient.clear();
      // Full navigation (not router.replace) so nothing from the old session survives.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    };
    // Fires here and in every other tab of this browser when the session ends.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        if (!isSigningOut()) toLogin();
      } else if (event === "USER_UPDATED" || event === "SIGNED_IN") {
        void queryClient.invalidateQueries({ queryKey: qk.me });
      }
    });
    // Back/forward cache: a page restored after sign-out must not show the old session's content.
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      void supabase.auth.getSession().then(({ data: s }) => (s.session ? queryClient.invalidateQueries({ queryKey: qk.me }) : toLogin()));
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(
    () => ({
      me: query.data ?? null,
      loading: query.isPending,
      refresh: () => query.refetch(),
      signOut: async () => {
        queryClient.clear();
        await signOutDevice();
      },
    }),
    [query, queryClient],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/** The signed-in user; only call below <AuthGate>, which guarantees it exists. */
export function useMe(): Me {
  const { me } = useSession();
  if (!me) throw new Error("useMe called without a signed-in user");
  return me;
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";

export type AppConfig = {
  features: { calls: boolean; push: boolean; uploads: boolean; email: boolean };
  registrationOpen: boolean;
  maintenance: { enabled: boolean; message: string };
  announcements: { id: string; title: string; body: string; level: "info" | "warning" | "critical" }[];
};

/** Which optional integrations are configured on the server, plus maintenance state. */
export function useAppConfig() {
  return useQuery({ queryKey: qk.appConfig, queryFn: () => api.get<AppConfig>("/api/config"), staleTime: 5 * 60_000 });
}

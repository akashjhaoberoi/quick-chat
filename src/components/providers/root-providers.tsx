"use client";

import { useState, type ReactNode } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { ThemeProvider, useTheme } from "./theme-provider";
import { ConfirmProvider } from "@/components/ui/confirm";
import { ClientApiError, errorMessage } from "@/lib/api/client";

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="top-center" richColors closeButton toastOptions={{ className: "!rounded-2xl" }} />;
}

export function RootProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (count, error) => {
              if (error instanceof ClientApiError && error.status >= 400 && error.status < 500) return false;
              return count < 2;
            },
          },
        },
        queryCache: new QueryCache({
          onError: (error, query) => {
            if (query.meta?.silent) return;
            if (error instanceof ClientApiError && error.status === 401) {
              // Full reload on purpose: drops every cached query of the expired session.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
            }
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (mutation.meta?.silent) return;
            toast.error(errorMessage(error));
          },
        }),
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <ConfirmProvider>
          {children}
          <ThemedToaster />
        </ConfirmProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

import { Suspense } from "react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { ListSkeleton } from "@/components/ui/feedback";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <SettingsShell>{children}</SettingsShell>
    </Suspense>
  );
}

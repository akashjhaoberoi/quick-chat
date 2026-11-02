import { Suspense } from "react";
import { ListSkeleton } from "@/components/ui/feedback";
import { SecuritySettings } from "@/components/settings/security-settings";

export const metadata = { title: "Security" };

export default function Page() {
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <SecuritySettings />
    </Suspense>
  );
}

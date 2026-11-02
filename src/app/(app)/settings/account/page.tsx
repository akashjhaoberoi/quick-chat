import { Suspense } from "react";
import { ListSkeleton } from "@/components/ui/feedback";
import { AccountSettings } from "@/components/settings/account-settings";

export const metadata = { title: "Account settings" };

export default function Page() {
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <AccountSettings />
    </Suspense>
  );
}

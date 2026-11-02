import { Suspense, type ReactNode } from "react";
import { ListSkeleton } from "@/components/ui/feedback";
import { ChatsShell } from "@/components/chat/chat-list";

export default function ChatsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ListSkeleton rows={8} />}>
      <ChatsShell>{children}</ChatsShell>
    </Suspense>
  );
}

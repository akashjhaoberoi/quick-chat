import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { ConversationView } from "@/components/chat/conversation-view";

export default function ConversationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full flex-1 items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <ConversationView />
    </Suspense>
  );
}

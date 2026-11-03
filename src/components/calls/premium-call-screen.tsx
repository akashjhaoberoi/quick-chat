"use client";

import { toast } from "sonner";
import { useEntitlement } from "@/components/premium/use-premium";
import { CallScreen } from "./call-screen";

/** CallScreen with premium video effects unlocked by the server-side entitlement. */
export function PremiumCallScreen() {
  const unlocked = useEntitlement("premium_video_effects");
  return (
    <CallScreen
      premiumUnlocked={unlocked}
      // Leaving the call to buy would end it, so just explain where to get it.
      onUpgrade={() => toast("This effect is part of Quick Chat Premium — see Settings → Premium after your call.")}
    />
  );
}

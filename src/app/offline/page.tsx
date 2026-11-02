import { WifiOff } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark className="h-14 w-14" />
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-surface-2 text-muted">
        <WifiOff className="h-7 w-7" />
      </div>
      <h1 className="font-display text-2xl font-extrabold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted">
        Quick Chat needs a connection to load conversations. For your privacy, messages and Snaps are not stored on this device.
      </p>
      <a href="/home" className="brand-gradient rounded-2xl px-5 py-2.5 text-sm font-bold text-white">
        Try again
      </a>
    </main>
  );
}

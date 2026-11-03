"use client";

import { useState } from "react";
import { Download, PlusSquare, Share } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { promptInstall, useInstallStatus, type InstallStatus } from "@/lib/pwa-install";
import { cn } from "@/lib/utils";

const STEPS: Record<"ios" | "macos-safari", { icon: typeof Share; text: string }[]> = {
  ios: [
    { icon: Share, text: "Tap the Share button in Safari's toolbar." },
    { icon: PlusSquare, text: "Scroll down and choose “Add to Home Screen”." },
    { icon: Download, text: "Tap “Add”. Quick Chat opens full-screen from your Home Screen." },
  ],
  "macos-safari": [
    { icon: Share, text: "In Safari's menu bar, open File (or the Share button)." },
    { icon: PlusSquare, text: "Choose “Add to Dock…”." },
    { icon: Download, text: "Click “Add”. Quick Chat opens as its own app from the Dock." },
  ],
};

/** Step-by-step instructions for browsers without a native install prompt (Safari). */
export function InstallInstructions({ status, open, onClose }: { status: InstallStatus; open: boolean; onClose: () => void }) {
  const steps = status === "ios" || status === "macos-safari" ? STEPS[status] : [];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Install Quick Chat"
      description={status === "ios" ? "Open this page in Safari, then:" : "In Safari on your Mac:"}
      footer={
        <Button className="w-full" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <ol className="space-y-3">
        {steps.map(({ icon: Icon, text }, i) => (
          <li key={text} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-brand">
              <Icon className="h-4 w-4" />
            </span>
            <span>
              <span className="font-bold">{i + 1}. </span>
              {text}
            </span>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

/**
 * "Install app" button. Uses the native prompt where the browser offers one,
 * shows Safari instructions on iPhone/iPad/Mac, and renders nothing when the
 * app is already installed or the browser can't install web apps.
 */
export function InstallButton({ label = "Install app", className, ...props }: Omit<ButtonProps, "onClick"> & { label?: string }) {
  const status = useInstallStatus();
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  if (status === "installed" || status === "unsupported") return null;

  return (
    <>
      <Button
        {...props}
        className={cn(className)}
        loading={busy}
        onClick={async () => {
          if (status !== "prompt") {
            setHelp(true);
            return;
          }
          setBusy(true);
          try {
            const outcome = await promptInstall();
            if (outcome === "accepted") toast.success("Quick Chat is installed");
          } catch {
            toast.error("Your browser couldn't open the install prompt. Use its menu → Install Quick Chat.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download className="h-4 w-4" />
        {label}
      </Button>
      <InstallInstructions status={status} open={help} onClose={() => setHelp(false)} />
    </>
  );
}

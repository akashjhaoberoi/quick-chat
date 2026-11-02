"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { LogOut, ShieldX } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { SessionProvider, useSession } from "@/components/providers/session-provider";
import { ModerationHistory } from "@/components/settings/moderation-history";

function SuspendedInner() {
  const { me, loading, signOut } = useSession();
  const router = useRouter();
  const status = me?.profile.status;
  const restricted = status === "suspended" || status === "banned";

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace("/login");
    else if (!restricted) router.replace("/home");
  }, [loading, me, restricted, router]);

  if (loading || !me || !restricted) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const until = me.profile.suspended_until ? new Date(me.profile.suspended_until) : null;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
        <Logo />
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 pb-16">
        <section className="rounded-3xl border border-border bg-surface p-6 text-center shadow-[var(--shadow-soft)] sm:p-8">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-danger-soft text-danger">
            <ShieldX className="h-8 w-8" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight">
            {status === "banned" ? "Your account has been banned" : "Your account is suspended"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {status === "banned"
              ? "This account was permanently removed from Quick Chat for violating our Community Guidelines."
              : until
                ? `You can use Quick Chat again after ${format(until, "d MMMM yyyy, HH:mm")}. Suspensions lift automatically.`
                : "Your account was suspended for violating our Community Guidelines."}{" "}
            If you believe this is a mistake, you can appeal below.
          </p>
          <p className="mt-3 text-xs text-muted">
            Signed in as @{me.profile.username} · Read the{" "}
            <Link href="/legal/community-guidelines" className="font-semibold text-brand hover:underline">
              Community Guidelines
            </Link>
          </p>
        </section>
        <section className="rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)] sm:p-6">
          <h2 className="font-display text-lg font-bold">Moderation decisions</h2>
          <p className="mb-2 mt-1 text-sm text-muted">Each decision can be appealed once. A moderator will review your appeal and you&apos;ll be notified.</p>
          <ModerationHistory userId={me.user.id} />
        </section>
      </main>
    </div>
  );
}

export function SuspendedView() {
  return (
    <SessionProvider>
      <SuspendedInner />
    </SessionProvider>
  );
}

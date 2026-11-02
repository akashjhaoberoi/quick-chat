"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** Consistent page title row used by every section. */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Shows a back button (router.back(), or the given href fallback). */
  back?: boolean | string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <div className={cn("flex items-center gap-3 px-4 pb-3 pt-4 md:px-6 md:pt-6", className)}>
      {back ? (
        <button
          type="button"
          onClick={() => (typeof back === "string" && window.history.length <= 1 ? router.push(back) : router.back())}
          className="-ml-2 rounded-full p-2 text-ink-2 hover:bg-surface-2"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle ? <p className="truncate text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Centered content column with sensible max width. */
export function PageContainer({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full", wide ? "max-w-6xl" : "max-w-3xl", className)}>{children}</div>;
}

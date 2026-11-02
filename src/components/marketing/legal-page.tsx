import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "./site-chrome";

const DOCS = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/community-guidelines", label: "Community Guidelines" },
];

/** Shared layout for legal documents (static server component). */
export function LegalPage({ title, updated, current, children }: { title: string; updated: string; current: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <nav aria-label="Legal documents" className="mb-6 flex flex-wrap gap-2">
          {DOCS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              aria-current={d.href === current ? "page" : undefined}
              className={
                d.href === current
                  ? "rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand"
                  : "rounded-full px-3 py-1.5 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-ink"
              }
            >
              {d.label}
            </Link>
          ))}
        </nav>
        <article className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-10 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-ink-2 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-ink-2">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="!mt-1 text-sm !text-muted">Last updated {updated} · Quick Chat by Akarika Technologies</p>
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

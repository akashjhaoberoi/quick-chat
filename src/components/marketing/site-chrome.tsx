import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/** Public header used by the landing and legal pages. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Quick Chat home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2" aria-label="Account">
          <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
            Sign in
          </Link>
          <Link href="/register" className="brand-gradient rounded-xl px-4 py-2 text-sm font-bold text-white shadow-[var(--shadow-soft)] hover:brightness-110">
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** Footer links, including every page Razorpay website verification looks for. */
export const FOOTER_LINKS = [
  { href: "/legal/about", label: "About Us" },
  { href: "/pricing", label: "Pricing" },
  { href: "/legal/contact", label: "Contact Us" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/refunds", label: "Refunds & Cancellation" },
  { href: "/legal/shipping", label: "Shipping & Delivery" },
  { href: "/legal/community-guidelines", label: "Community Guidelines" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
        <p>© Akarika Technologies. Quick Chat is original software by Akarika Technologies.</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2" aria-label="Legal">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

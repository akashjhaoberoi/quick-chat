import { cn } from "@/lib/utils";

/**
 * Quick Chat mark: a rounded speech bubble whose tail and inner bolt form a
 * "Q", suggesting speed. Original artwork for Akarika Technologies.
 * Light-orange brand: #FFB76B → #FF9F43 → #F47B20.
 */
export function LogoMark({ className, title = "Quick Chat" }: { className?: string; title?: string }) {
  // An empty title marks the logo as decorative (e.g. next to a visible wordmark).
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8", className)} {...a11y}>
      <defs>
        <linearGradient id="qc-orange" x1="6" y1="4" x2="60" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFB76B" />
          <stop offset="0.5" stopColor="#FF9F43" />
          <stop offset="1" stopColor="#F47B20" />
        </linearGradient>
      </defs>
      <path
        d="M32 5C17.1 5 6 15.6 6 29.5c0 7.3 3 13.6 8.1 18.1-.5 3.4-2 6.6-4.6 9.4 5.5.3 10.2-1.4 13.9-4.3 2.7.8 5.6 1.3 8.6 1.3 14.9 0 26-10.6 26-24.5S46.9 5 32 5Z"
        fill="url(#qc-orange)"
      />
      <path d="M35.6 14.5 22.8 32.4h8.6l-2.9 15.1 13-19h-8.7l2.8-14Z" fill="#fff" />
      <path d="M44 41.5c3 1.4 5.8 3.8 8.3 7.4" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" opacity=".95" />
    </svg>
  );
}

/**
 * "QUICK CHAT" wordmark in the display face. "CHAT" uses the text-safe brand
 * orange (`text-brand` resolves to --brand-text, ≥4.5:1 on light surfaces).
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("whitespace-nowrap font-display font-extrabold uppercase leading-none tracking-[0.12em] text-ink", className)}>
      Quick <span className="text-brand">Chat</span>
    </span>
  );
}

export function Logo({ className, showTagline = false }: { className?: string; showTagline?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-9 w-9 shrink-0 drop-shadow-sm" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-xl font-extrabold tracking-tight">
          Quick <span className="brand-text">Chat</span>
        </span>
        {showTagline && <span className="mt-1 text-[11px] font-medium text-muted">Connect. Chat. Share.</span>}
      </span>
    </span>
  );
}

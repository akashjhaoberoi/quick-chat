import { cn } from "@/lib/utils";

/**
 * Quick Chat mark: a rounded speech bubble whose tail and inner bolt form a
 * "Q", suggesting speed. Original artwork for Akarika Technologies.
 */
export function LogoMark({ className, title = "Quick Chat" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8", className)} role="img" aria-label={title}>
      <defs>
        <linearGradient id="qc-g" x1="6" y1="4" x2="60" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset="0.5" stopColor="#B45CF5" />
          <stop offset="1" stopColor="#FF5E7E" />
        </linearGradient>
      </defs>
      <path
        d="M32 5C17.1 5 6 15.6 6 29.5c0 7.3 3 13.6 8.1 18.1-.5 3.4-2 6.6-4.6 9.4 5.5.3 10.2-1.4 13.9-4.3 2.7.8 5.6 1.3 8.6 1.3 14.9 0 26-10.6 26-24.5S46.9 5 32 5Z"
        fill="url(#qc-g)"
      />
      <path d="M35.6 14.5 22.8 32.4h8.6l-2.9 15.1 13-19h-8.7l2.8-14Z" fill="#fff" />
      <path d="M44 41.5c3 1.4 5.8 3.8 8.3 7.4" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" opacity=".95" />
    </svg>
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

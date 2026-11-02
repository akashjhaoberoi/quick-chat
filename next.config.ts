import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

function origin(url: string | undefined): string[] {
  if (!url) return [];
  try {
    const u = new URL(url);
    const out = [u.origin];
    if (u.protocol === "https:") out.push(`wss://${u.host}`);
    if (u.protocol === "wss:") out.push(`https://${u.host}`);
    return out;
  } catch {
    return [];
  }
}

const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const livekit = origin(process.env.LIVEKIT_URL);
const r2Public = origin(process.env.CLOUDFLARE_R2_PUBLIC_URL);
const r2Account = process.env.CLOUDFLARE_ACCOUNT_ID ? [`https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`] : [];
const firebase = [
  "https://firebaseinstallations.googleapis.com",
  "https://fcmregistrations.googleapis.com",
  "https://firebase.googleapis.com",
];

const mediaSources = ["'self'", "blob:", "data:", ...supabase, ...r2Public, ...r2Account];

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; a nonce would force every page
  // to render dynamically, which defeats the static app shell.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.gstatic.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  `img-src ${[...mediaSources, "https://*.tile.openstreetmap.org", "https://lh3.googleusercontent.com"].join(" ")}`,
  `media-src ${mediaSources.join(" ")}`,
  `connect-src ${["'self'", ...supabase, ...livekit, ...r2Account, ...r2Public, ...firebase, isDev ? "ws:" : ""].filter(Boolean).join(" ")}`,
  "frame-src 'self' https://www.openstreetmap.org",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // No upgrade-insecure-requests: WebKit applies it to http://localhost (breaking `next start`); HSTS covers production.
]
  .filter(Boolean)
  .join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  serverExternalPackages: ["firebase-admin", "ioredis"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), display-capture=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Media redirects set their own (short, private) cache headers.
        source: "/api/:path((?!media/).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;

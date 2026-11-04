import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { refreshSession } from "@/lib/supabase/proxy";

const PUBLIC_PREFIXES = [
  "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/auth/",
  "/offline", "/legal", "/pricing", "/setup", "/suspended",
];
const GUEST_ONLY = ["/login", "/register", "/forgot-password"];

function isPublic(pathname: string) {
  return pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isSupabaseConfigured) {
    if (pathname.startsWith("/api/") || pathname === "/setup" || pathname === "/" || pathname === "/offline" || pathname.startsWith("/legal") || pathname === "/pricing") {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const { response, userId } = await refreshSession(request);

  // API routes perform their own authentication/authorization.
  if (pathname.startsWith("/api/")) {
    return response;
  }

  if (!userId && !isPublic(pathname)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (userId && (pathname === "/" || GUEST_ONLY.some((p) => pathname === p))) {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    {
      // Everything except static assets, the service worker and metadata files.
      source: "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)",
      // Skip router prefetches: redirecting a per-segment prefetch (e.g. /register while signed
      // in) makes the follow-up request ask /home for a segment it doesn't have, which 404s.
      // Real navigations still pass through here, and the app shell re-checks the session.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

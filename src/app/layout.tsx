import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Sora } from "next/font/google";
import { RootProviders } from "@/components/providers/root-providers";
import { themeInitScript } from "@/components/providers/theme-provider";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { publicEnv } from "@/lib/env";
import { installCaptureScript } from "@/lib/pwa-install-script";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", weight: ["600", "700", "800"], display: "swap" });


export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  title: { default: "Quick Chat — Connect. Chat. Share.", template: "%s · Quick Chat" },
  description: "Quick Chat by Akarika Technologies: real-time messaging, disappearing Snaps, Stories, calls and more.",
  applicationName: "Quick Chat",
  authors: [{ name: "Akarika Technologies" }],
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Quick Chat" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "Quick Chat",
    title: "Quick Chat — Your Moments. Your Conversations.",
    description: "Real-time chat, Snaps, Stories and calls. By Akarika Technologies.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#101010" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: installCaptureScript }} />
      </head>
      <body className="min-h-dvh">
        <RootProviders>{children}</RootProviders>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

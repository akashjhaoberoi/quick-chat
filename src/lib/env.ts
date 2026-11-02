/**
 * Environment configuration.
 *
 * Mandatory: Supabase URL + anon key (+ service role key on the server).
 * Optional integrations degrade gracefully and report themselves as
 * "not configured" instead of pretending to work.
 *
 * NEXT_PUBLIC_* values must be referenced statically so Next.js can inline
 * them into client bundles.
 */
import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.string().url().optional());

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Quick Chat"),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  NEXT_PUBLIC_FIREBASE_API_KEY: optionalString,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: optionalString,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: optionalString,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: optionalString,
  NEXT_PUBLIC_FIREBASE_APP_ID: optionalString,
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: optionalString,
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || undefined,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
});

export const isSupabaseConfigured = Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const isPushConfiguredClient = Boolean(
  publicEnv.NEXT_PUBLIC_FIREBASE_API_KEY &&
    publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    publicEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID &&
    publicEnv.NEXT_PUBLIC_FIREBASE_APP_ID &&
    publicEnv.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
);

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  CLOUDFLARE_ACCOUNT_ID: optionalString,
  CLOUDFLARE_R2_ACCESS_KEY_ID: optionalString,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: optionalString,
  CLOUDFLARE_R2_BUCKET_NAME: optionalString,
  CLOUDFLARE_R2_PUBLIC_URL: optionalUrl,
  SUPABASE_STORAGE_BUCKET: z.string().default("media"),
  LIVEKIT_URL: optionalString,
  LIVEKIT_API_KEY: optionalString,
  LIVEKIT_API_SECRET: optionalString,
  FIREBASE_SERVICE_ACCOUNT: optionalString,
  RESEND_API_KEY: optionalString,
  RESEND_FROM_EMAIL: z.string().default("Quick Chat <no-reply@quickchat.akarikatechnologies.in>"),
  REDIS_URL: optionalString,
  CRON_SECRET: optionalString,
  ADMIN_REQUIRE_MFA: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | null = null;

/** Server-only configuration. Never import the result into client components. */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must not be called in the browser");
  }
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse(process.env);
  }
  return cachedServerEnv;
}

export type IntegrationStatus = {
  supabase: boolean;
  serviceRole: boolean;
  storage: "r2" | "supabase" | null;
  livekit: boolean;
  push: boolean;
  email: boolean;
  redis: boolean;
  cron: boolean;
};

export function integrationStatus(): IntegrationStatus {
  const env = serverEnv();
  const r2 = Boolean(
    env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_R2_ACCESS_KEY_ID && env.CLOUDFLARE_R2_SECRET_ACCESS_KEY && env.CLOUDFLARE_R2_BUCKET_NAME,
  );
  return {
    supabase: isSupabaseConfigured,
    serviceRole: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    storage: r2 ? "r2" : isSupabaseConfigured && env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : null,
    livekit: Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET),
    push: Boolean(env.FIREBASE_SERVICE_ACCOUNT) && isPushConfiguredClient,
    email: Boolean(env.RESEND_API_KEY),
    redis: Boolean(env.REDIS_URL),
    cron: Boolean(env.CRON_SECRET),
  };
}

/** Human-readable startup report used by instrumentation.ts. */
export function validateEnvironment(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  let status: IntegrationStatus;
  try {
    status = integrationStatus();
  } catch (error) {
    return { errors: [`Invalid environment variable: ${(error as Error).message}`], warnings };
  }
  if (!status.supabase) errors.push("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing — the app will run in setup mode.");
  if (!status.serviceRole) errors.push("SUPABASE_SERVICE_ROLE_KEY is missing — media, push, admin and account deletion are disabled.");
  if (!status.storage) warnings.push("No media storage configured (Cloudflare R2 or Supabase Storage) — uploads are disabled.");
  if (!status.livekit) warnings.push("LiveKit is not configured — audio/video calls are disabled.");
  if (!status.push) warnings.push("Firebase Cloud Messaging is not fully configured — browser push notifications are disabled.");
  if (!status.email) warnings.push("RESEND_API_KEY is missing — security alert emails are disabled.");
  if (!status.redis) warnings.push("REDIS_URL is missing — rate limiting falls back to per-instance memory.");
  if (!status.cron) warnings.push("CRON_SECRET is missing — /api/cron/* endpoints are disabled.");
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE|PRIVATE/i.test(key)) {
      errors.push(`${key} looks like a secret but is exposed to the browser via NEXT_PUBLIC_.`);
    }
  }
  return { errors, warnings };
}

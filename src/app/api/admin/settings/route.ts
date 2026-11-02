import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { PROFILE } from "../_lib/shared";

type Row = { key: string; value: unknown; updated_at: string; updated_by: Record<string, unknown> | null };

const DEFAULTS = {
  maintenance_mode: { enabled: false, message: "" },
  registration_open: true,
  limits: { max_upload_mb_image: 15, max_upload_mb_video: 100, daily_upload_mb: 1024 },
  content_policy: { version: 1, url: "/legal/community-guidelines" },
};

/** GET /api/admin/settings — app settings (admin+). */
export const GET = handler({ auth: { admin: "admin" } }, async ({ supabase }) => {
  const rows = (unwrap(
    await supabase.from("app_settings").select(`key, value, updated_at, updated_by:profiles!app_settings_updated_by_fkey(${PROFILE})`),
  ) ?? []) as unknown as Row[];
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const value = <K extends keyof typeof DEFAULTS>(key: K): (typeof DEFAULTS)[K] => {
    const v = byKey.get(key)?.value;
    if (v === undefined || v === null) return DEFAULTS[key];
    if (typeof DEFAULTS[key] === "object") return { ...(DEFAULTS[key] as object), ...(v as object) } as (typeof DEFAULTS)[K];
    return v as (typeof DEFAULTS)[K];
  };
  return {
    maintenance_mode: value("maintenance_mode"),
    registration_open: Boolean(value("registration_open")),
    limits: value("limits"),
    content_policy: value("content_policy"),
    updated: Object.fromEntries(rows.map((r) => [r.key, { updated_at: r.updated_at, updated_by: r.updated_by }])),
  };
});

const mb = z.coerce.number().int().min(1).max(10_240);

const body = z.discriminatedUnion("key", [
  z.object({
    key: z.literal("maintenance_mode"),
    value: z.object({ enabled: z.boolean(), message: z.string().trim().max(300) }),
  }),
  z.object({ key: z.literal("registration_open"), value: z.boolean() }),
  z.object({
    key: z.literal("limits"),
    value: z.object({ max_upload_mb_image: mb, max_upload_mb_video: mb, daily_upload_mb: mb }),
  }),
  z.object({
    key: z.literal("content_policy"),
    value: z.object({
      version: z.coerce.number().int().min(1).max(10_000),
      url: z
        .string()
        .trim()
        .max(300)
        .refine((u) => u.startsWith("/") || /^https:\/\//.test(u), "Use a path like /legal/... or an https:// URL"),
    }),
  }),
]);

/** PATCH /api/admin/settings {key, value} — update one setting (admin+, rpc admin_update_setting; audited). */
export const PATCH = handler(
  { auth: { admin: "admin" }, body, rateLimit: { name: "admin.settings", limit: 30, window: 60 } },
  async ({ supabase, body }) => {
    unwrap(await supabase.rpc("admin_update_setting", { p_key: body.key, p_value: body.value }));
    return { key: body.key, value: body.value };
  },
);

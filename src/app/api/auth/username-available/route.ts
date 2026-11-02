import { connection } from "next/server";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { usernameSchema } from "@/lib/validation";

const query = z.object({ username: z.string().max(64).default("") });

/**
 * GET /api/auth/username-available?username= → { username, available, reason? }
 * Public (used by sign-up). When signed in, your own current username counts as available.
 */
export const GET = handler(
  { auth: "none", query, rateLimit: { name: "auth.username", limit: 60, window: 60 } },
  async ({ supabase, query }) => {
    await connection();
    const parsed = usernameSchema.safeParse(query.username);
    if (!parsed.success) {
      return { username: query.username, available: false, reason: parsed.error.issues[0]?.message ?? "Invalid username" };
    }
    const available = unwrap(await supabase.rpc("check_username_available", { p_username: parsed.data })) as boolean;
    return {
      username: parsed.data,
      available: Boolean(available),
      reason: available ? undefined : "That username is taken or reserved",
    };
  },
);

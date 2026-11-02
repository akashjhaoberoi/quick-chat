import { handler, requireIntegration, unwrap } from "@/lib/api/handler";
import { createCallToken, livekitConfigured } from "@/lib/livekit";
import { uuid } from "@/lib/validation";
import { displayName } from "@/lib/utils";
import type { Call } from "@/types/models";
import type { JoinCallResponse } from "@/components/calls/types";

/**
 * Marks the caller as joined (rpc join_call validates membership and call state)
 * and only then mints a short-lived, room-scoped LiveKit token.
 */
export const POST = handler(
  { rateLimit: { name: "calls.join", limit: 30, window: 60 } },
  async ({ supabase, params, user }): Promise<JoinCallResponse> => {
    requireIntegration(livekitConfigured(), "Audio & video calling");
    const id = uuid.parse(params.id);
    const call = unwrap(await supabase.rpc("join_call", { p_call_id: id })) as Call;
    const { data: profile } = await supabase.from("profiles").select("username, display_name").eq("id", user.id).maybeSingle();
    const { token, url } = await createCallToken({ room: call.room_name, identity: user.id, name: displayName(profile) });
    return { token, url, call };
  },
);

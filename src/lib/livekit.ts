import "server-only";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { integrationStatus, serverEnv } from "@/lib/env";

/**
 * LiveKit access tokens are minted server-side only, for users the database
 * has already marked as joined participants (public.join_call). Tokens are
 * short-lived and scoped to a single room. The API secret never leaves the server.
 */
export function livekitConfigured() {
  return integrationStatus().livekit;
}

export async function createCallToken(params: { room: string; identity: string; name: string }) {
  const env = serverEnv();
  const token = new AccessToken(env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!, {
    identity: params.identity,
    name: params.name,
    ttl: "15m",
  });
  token.addGrant({
    room: params.room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return { token: await token.toJwt(), url: env.LIVEKIT_URL! };
}

/** Best-effort room teardown when a call ends. */
export async function closeRoom(room: string) {
  if (!livekitConfigured()) return;
  const env = serverEnv();
  const host = env.LIVEKIT_URL!.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  try {
    await new RoomServiceClient(host, env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!).deleteRoom(room);
  } catch {
    // Room may already be gone.
  }
}

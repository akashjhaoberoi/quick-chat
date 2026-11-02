import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Fixed-window rate limiter. Uses Redis when REDIS_URL is set so limits are
 * shared across serverless instances; otherwise falls back to an in-process
 * map (adequate for development, best-effort in production).
 * Critical limits are additionally enforced inside the database RPCs.
 */
type Result = { ok: boolean; remaining: number; resetSeconds: number };

type RedisPipeline = {
  incr(key: string): RedisPipeline;
  expire(key: string, seconds: number, mode: "NX"): RedisPipeline;
  ttl(key: string): RedisPipeline;
  exec(): Promise<[Error | null, unknown][] | null>;
};
type RedisLike = { multi(): RedisPipeline };

let redisPromise: Promise<RedisLike | null> | null = null;
const memory = new Map<string, { count: number; resetAt: number }>();

async function getRedis(): Promise<RedisLike | null> {
  const url = serverEnv().REDIS_URL;
  if (!url) return null;
  if (!redisPromise) {
    redisPromise = import("ioredis")
      .then(({ default: Redis }) => {
        const client = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
        client.on("error", (err) => console.error(JSON.stringify({ level: "error", msg: "redis_error", err: err.message })));
        return client as unknown as RedisLike;
      })
      .catch(() => null);
  }
  return redisPromise;
}

function memoryLimit(key: string, limit: number, windowSec: number): Result {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    if (memory.size > 50_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    return { ok: true, remaining: limit - 1, resetSeconds: windowSec };
  }
  entry.count += 1;
  return { ok: entry.count <= limit, remaining: Math.max(limit - entry.count, 0), resetSeconds: Math.ceil((entry.resetAt - now) / 1000) };
}

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<Result> {
  const redis = await getRedis();
  if (!redis) return memoryLimit(key, limit, windowSec);
  try {
    const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const res = await redis.multi().incr(bucket).expire(bucket, windowSec, "NX").ttl(bucket).exec();
    const count = Number(res?.[0]?.[1] ?? 0);
    const ttl = Number(res?.[2]?.[1] ?? windowSec);
    return { ok: count <= limit, remaining: Math.max(limit - count, 0), resetSeconds: ttl > 0 ? ttl : windowSec };
  } catch {
    return memoryLimit(key, limit, windowSec);
  }
}

import { Redis, type RedisOptions } from 'ioredis';
import { env } from '../config/env.js';

/** Parse the REDIS_URL into ioredis options (shared by app + BullMQ). */
function parseRedisOptions(): RedisOptions {
  const u = new URL(env.REDIS_URL);
  // A `rediss://` URL (e.g. Upstash) requires TLS.
  const useTls = u.protocol === 'rediss:';
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(useTls ? { tls: { servername: u.hostname } } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

/**
 * Connection options object. BullMQ bundles its own ioredis copy, so we hand it
 * plain options (not a Redis instance) to avoid cross-package type conflicts.
 */
export const redisConnection: RedisOptions = parseRedisOptions();

/** Shared Redis client for app-level use (rate-limit, health checks). */
export const redis = new Redis(redisConnection);
// ioredis emits an `error` event in addition to rejecting individual commands.
// Handle it so an optional cache outage does not become an unhandled process error.
redis.on('error', () => undefined);

export const createRedisConnection = () => new Redis(redisConnection);

/**
 * Small, fail-open cache facade for read-heavy storefront endpoints.
 * Redis must improve latency, never become a reason a customer cannot browse.
 */
export const cache = {
  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    try {
      const hit = await redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      // Continue to the database when Redis is unavailable.
    }

    const value = await loader();
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Cache writes are deliberately non-blocking for the request result.
    }
    return value;
  },

  /** Delete every key in a namespace without using Redis' blocking KEYS command. */
  async invalidateNamespace(namespace: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `${namespace}:*`, 'COUNT', 100);
        cursor = next;
        if (keys.length) await redis.del(...keys);
      } while (cursor !== '0');
    } catch {
      // A stale cache is acceptable temporarily; a failed write must not fail the mutation.
    }
  },
};

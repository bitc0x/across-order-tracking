/**
 * Upstash Redis-backed persistence.
 *
 * Vercel KV was sunset in December 2024 and migrated to "Upstash for Redis"
 * via the Vercel Marketplace. We use the Upstash SDK directly with a
 * dual-env-var fallback so the same code works whether Vercel injects the
 * legacy KV_REST_API_* names (for projects migrated from Vercel KV) or the
 * native UPSTASH_REDIS_REST_* names (for fresh Marketplace installs).
 *
 * Key shapes:
 *   order:{orderHash}   — JSON-serialized OrderRecord
 *   active              — Redis SET of orderHashes in non-terminal state.
 *
 * Resilience: if neither set of env vars is configured, the module exports
 * a no-op store that throws on writes and returns null on reads, so the
 * landing page and build still work without storage provisioned. Useful for
 * the first deploy before the Marketplace integration is added.
 */

import { Redis } from '@upstash/redis';
import type { OrderRecord } from './types';
import { isTerminal } from './types';

const ACTIVE_KEY = 'active';
const orderKey = (orderHash: string) => `order:${orderHash}`;

function redisUrl(): string | undefined {
  return process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
}
function redisToken(): string | undefined {
  return process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
}

export const KV_AVAILABLE = Boolean(redisUrl() && redisToken());

let clientSingleton: Redis | null = null;
function getRedis(): Redis {
  if (clientSingleton) return clientSingleton;
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) throw new Error('Redis not configured');
  clientSingleton = new Redis({ url, token });
  return clientSingleton;
}

export const store = {
  async get(orderHash: string): Promise<OrderRecord | null> {
    if (!KV_AVAILABLE) return null;
    const r = getRedis();
    return (await r.get<OrderRecord>(orderKey(orderHash))) ?? null;
  },

  async put(record: OrderRecord): Promise<void> {
    if (!KV_AVAILABLE) throw new Error('Redis not configured');
    const r = getRedis();
    await r.set(orderKey(record.orderHash), record);
    if (isTerminal(record.state)) {
      await r.srem(ACTIVE_KEY, record.orderHash);
    } else {
      await r.sadd(ACTIVE_KEY, record.orderHash);
    }
  },

  /**
   * Initial registration (used by submit endpoint). Adds to active set.
   */
  async create(record: OrderRecord): Promise<void> {
    if (!KV_AVAILABLE) throw new Error('Redis not configured');
    const r = getRedis();
    await r.set(orderKey(record.orderHash), record);
    await r.sadd(ACTIVE_KEY, record.orderHash);
  },

  /**
   * Iterates non-terminal orders. Used by daily sweep cron. Hobby plan caps
   * cron to 1/day so this is a coarse safety net for orders nobody queried.
   */
  async listActive(): Promise<string[]> {
    if (!KV_AVAILABLE) return [];
    const r = getRedis();
    const members = await r.smembers(ACTIVE_KEY);
    return members as string[];
  },

  /**
   * For terminal transitions: ensure removal from active set even if put()
   * wasn't called with the latest state for some reason.
   */
  async markTerminal(orderHash: string): Promise<void> {
    if (!KV_AVAILABLE) return;
    const r = getRedis();
    await r.srem(ACTIVE_KEY, orderHash);
  },
};

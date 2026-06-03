/**
 * KV-backed persistence. Vercel KV (Upstash Redis) under the hood.
 *
 * Key shapes:
 *   order:{orderHash}   — JSON-serialized OrderRecord
 *   active              — Redis SET of orderHashes in non-terminal state.
 *
 * The sweep cron iterates `active` to poll only orders that aren't done yet.
 * When a record transitions to terminal we SREM it from `active` (still keep
 * the order:{orderHash} record around for status queries).
 *
 * Resilience: if KV env vars aren't configured (KV_REST_API_URL missing),
 * the module exports a no-op store that throws on writes and returns null
 * on reads, so the rest of the app builds and runs without KV. This lets us
 * deploy + sanity-check the public landing page before KV is provisioned.
 */

import { kv } from '@vercel/kv';
import type { OrderRecord } from './types';
import { isTerminal } from './types';

const ACTIVE_KEY = 'active';
const orderKey = (orderHash: string) => `order:${orderHash}`;

function kvAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export const KV_AVAILABLE = kvAvailable();

export const store = {
  async get(orderHash: string): Promise<OrderRecord | null> {
    if (!kvAvailable()) return null;
    return (await kv.get<OrderRecord>(orderKey(orderHash))) ?? null;
  },

  async put(record: OrderRecord): Promise<void> {
    if (!kvAvailable()) throw new Error('KV not configured');
    await kv.set(orderKey(record.orderHash), record);
    if (isTerminal(record.state)) {
      await kv.srem(ACTIVE_KEY, record.orderHash);
    } else {
      await kv.sadd(ACTIVE_KEY, record.orderHash);
    }
  },

  /**
   * Initial registration (used by submit endpoint). Adds to active set.
   */
  async create(record: OrderRecord): Promise<void> {
    if (!kvAvailable()) throw new Error('KV not configured');
    await kv.set(orderKey(record.orderHash), record);
    await kv.sadd(ACTIVE_KEY, record.orderHash);
  },

  /**
   * Iterates non-terminal orders. Used by daily sweep cron. Hobby plan caps
   * cron to 1/day so this is a coarse safety net for orders nobody queried.
   */
  async listActive(): Promise<string[]> {
    if (!kvAvailable()) return [];
    const members = await kv.smembers(ACTIVE_KEY);
    return members as string[];
  },

  /**
   * For terminal transitions: ensure removal from active set even if put()
   * wasn't called with the latest state for some reason.
   */
  async markTerminal(orderHash: string): Promise<void> {
    if (!kvAvailable()) return;
    await kv.srem(ACTIVE_KEY, orderHash);
  },
};

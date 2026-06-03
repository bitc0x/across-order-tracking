/**
 * Across origin-leg adapter.
 *
 * Calls app.across.to/api/deposit/status with depositId. Returns normalized
 * BridgePoll. The Across API's `status` field has these documented values:
 *
 *   pending  | filled   — leg in flight or settled
 *   refunded            — deposit was never picked up, USDC returned to depositor
 *
 * The status endpoint accepts both ?depositId= and ?depositTxHash=. We key
 * on depositId because it's the authoritative identifier (matches the
 * V3FundsDeposited event topic) and tx hashes can race the indexer.
 *
 * No API key required. CORS-enabled on the server-to-server path.
 */

import type { BridgePoll } from '../types';

const ACROSS_STATUS = 'https://app.across.to/api/deposit/status';

type AcrossStatusResponse = {
  status: string;          // 'pending' | 'filled' | 'refunded' (per docs)
  fillTx?: string;
  // Plus other fields we don't need here.
};

export async function pollAcrossStatus(
  originChainId: number,
  depositId: string,
): Promise<BridgePoll> {
  const url = `${ACROSS_STATUS}?originChainId=${originChainId}&depositId=${encodeURIComponent(depositId)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    // 404 typically means the indexer hasn't seen the deposit yet — treat as pending
    // rather than throwing, so a fresh order doesn't drop out of polling.
    if (res.status === 404) return { status: 'pending' };
    throw new Error(`across status fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as AcrossStatusResponse;

  // Normalize. Anything we don't recognize stays as 'pending' (forward-compat).
  let status: BridgePoll['status'] = 'pending';
  if (data.status === 'filled') status = 'filled';
  else if (data.status === 'refunded') status = 'refunded';

  return {
    status,
    fillTxHash: data.fillTx,
  };
}

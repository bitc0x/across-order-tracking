/**
 * GET /api/order/status/{orderHash}
 *
 * Polling architecture: lazy. The first GET after submit triggers upstream
 * polling (Across + 1inch in parallel), applies state transitions, persists,
 * and returns the fresh state. Subsequent GETs within POLL_TTL_MS reuse the
 * cached state without re-polling, to keep upstream pressure bounded.
 *
 * This design works on Vercel Hobby (no every-minute cron available) and is
 * actually a cleaner pattern for integrator APIs: polling cost scales with
 * integrator query volume rather than running idle work for no audience.
 *
 * A separate daily cron at /api/cron/sweep catches stuck non-terminal orders
 * that nobody queries.
 *
 * Response shape is stable and documented in README. Integrators rely on:
 *   - `state` (the State enum)
 *   - `recoveryPath` (what to surface to the user)
 *   - `bridge.fillTxHash`, `destination.fillTxHash` for explorer links
 *   - `destination.failureReason` for diagnostic display
 */

import { NextRequest, NextResponse } from 'next/server';
import { store, KV_AVAILABLE } from '@/lib/store';
import { applyPolls, computeRecoveryPath } from '@/lib/state-machine';
import { pollAcrossStatus } from '@/lib/adapters/across';
import { pollFusionStatus } from '@/lib/adapters/fusion';
import { isTerminal } from '@/lib/types';

const POLL_TTL_MS = 5_000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderHash: string }> },
) {
  if (!KV_AVAILABLE) {
    return NextResponse.json(
      { error: 'storage not configured: set KV_REST_API_URL and KV_REST_API_TOKEN' },
      { status: 503 },
    );
  }

  const { orderHash } = await params;
  const record = await store.get(orderHash);
  if (!record) {
    return NextResponse.json({ error: 'order not found' }, { status: 404 });
  }

  const stale = !isTerminal(record.state) && Date.now() - record.lastPolledAt > POLL_TTL_MS;
  if (stale) {
    // Poll both upstream legs in parallel. Adapter failures don't break the
    // response — we return the previously-cached state and try again on next GET.
    const [bridge, destination] = await Promise.all([
      pollAcrossStatus(record.originChainId, record.depositId).catch((e) => {
        console.error('[poll] across failed:', e);
        return null;
      }),
      pollFusionStatus(orderHash).catch((e) => {
        console.error('[poll] fusion failed:', e);
        return null;
      }),
    ]);

    const { changed } = applyPolls(record, bridge, destination);
    if (changed) await store.put(record);
  }

  return NextResponse.json({
    orderHash: record.orderHash,
    strategy: record.strategy,
    state: record.state,
    recoveryPath: computeRecoveryPath(record.state),
    bridge: {
      originChainId: record.originChainId,
      depositId: record.depositId,
      depositTxHash: record.depositTxHash,
      fillTxHash: record.bridgeFillTxHash ?? null,
    },
    destination: {
      destinationChainId: record.destinationChainId,
      fillTxHash: record.destinationFillTxHash ?? null,
      filledAmount: record.destinationFilledAmount ?? null,
      failureReason: record.failureReason ?? null,
    },
    expectedDeliveryAmount: record.expectedDeliveryAmount,
    userAddress: record.userAddress,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastPolledAt: record.lastPolledAt,
  });
}

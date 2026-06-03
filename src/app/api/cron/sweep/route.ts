/**
 * GET /api/cron/sweep
 *
 * Daily safety-net sweep. Vercel Hobby caps cron to 1/day so this can't
 * substitute for real polling — the status endpoint does lazy polling on
 * GET, which is the primary mechanism. This cron catches orders that:
 *
 *   - went pending hours ago and nobody queried their status
 *   - should have hit a terminal state by now (Fusion auctions max ~3 min)
 *
 * Authorization: requires `Authorization: Bearer $CRON_SECRET`. Vercel Cron
 * automatically sends this header when configured per vercel.json. Manual
 * invocations need the same header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { store, KV_AVAILABLE } from '@/lib/store';
import { applyPolls } from '@/lib/state-machine';
import { pollAcrossStatus } from '@/lib/adapters/across';
import { pollFusionStatus } from '@/lib/adapters/fusion';
import { isTerminal } from '@/lib/types';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (!KV_AVAILABLE) {
    return NextResponse.json({ error: 'storage not configured' }, { status: 503 });
  }

  const active = await store.listActive();
  const transitions: Array<{ orderHash: string; from: string; to: string }> = [];

  for (const orderHash of active) {
    const record = await store.get(orderHash);
    if (!record) continue;
    if (isTerminal(record.state)) {
      // Defensive cleanup if a terminal record stayed in the active set.
      await store.markTerminal(orderHash);
      continue;
    }

    const [bridge, destination] = await Promise.all([
      pollAcrossStatus(record.originChainId, record.depositId).catch(() => null),
      pollFusionStatus(orderHash).catch(() => null),
    ]);

    const prevState = record.state;
    const { changed, transitioned } = applyPolls(record, bridge, destination);
    if (changed) {
      await store.put(record);
      if (transitioned) {
        transitions.push({ orderHash, from: prevState, to: record.state });
      }
    }
  }

  return NextResponse.json({
    polled: active.length,
    transitioned: transitions.length,
    transitions,
  });
}

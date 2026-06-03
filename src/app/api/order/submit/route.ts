/**
 * POST /api/order/submit
 *
 * Integrator (or the integrator's frontend) calls this immediately after the
 * Fusion order is submitted to 1inch. Body is the minimum information needed
 * to track the order through to terminal state and surface recovery semantics.
 *
 * Idempotent: a second submit for the same orderHash returns the existing
 * state without re-registering.
 *
 * Response: { orderHash, state } — caller can immediately start polling
 * /api/order/status/{orderHash} on whatever cadence makes sense for their UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { store, KV_AVAILABLE } from '@/lib/store';
import type { OrderRecord } from '@/lib/types';

type SubmitBody = {
  strategy: 'fusion-same-chain';
  orderHash: string;
  originChainId: number;
  destinationChainId: number;
  depositId: string;
  depositTxHash: string;
  userAddress: string;
  expectedDeliveryAmount: string;
  webhookUrl?: string; // reserved for v2
};

const REQUIRED = [
  'strategy',
  'orderHash',
  'originChainId',
  'destinationChainId',
  'depositId',
  'depositTxHash',
  'userAddress',
  'expectedDeliveryAmount',
] as const;

export async function POST(req: NextRequest) {
  if (!KV_AVAILABLE) {
    return NextResponse.json(
      { error: 'storage not configured: set KV_REST_API_URL and KV_REST_API_TOKEN' },
      { status: 503 },
    );
  }

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  for (const field of REQUIRED) {
    if (!(field in body) || body[field] === undefined || body[field] === null || body[field] === '') {
      return NextResponse.json({ error: `missing required field: ${field}` }, { status: 400 });
    }
  }

  if (body.strategy !== 'fusion-same-chain') {
    return NextResponse.json(
      { error: `unsupported strategy: ${body.strategy} (only 'fusion-same-chain' in v1)` },
      { status: 400 },
    );
  }

  const existing = await store.get(body.orderHash);
  if (existing) {
    return NextResponse.json({ orderHash: body.orderHash, state: existing.state });
  }

  const now = Date.now();
  const record: OrderRecord = {
    orderHash: body.orderHash,
    strategy: body.strategy,
    state: 'pending',
    originChainId: body.originChainId,
    destinationChainId: body.destinationChainId,
    depositId: body.depositId,
    depositTxHash: body.depositTxHash,
    userAddress: body.userAddress,
    expectedDeliveryAmount: body.expectedDeliveryAmount,
    webhookUrl: body.webhookUrl,
    lastPolledAt: 0,
    createdAt: now,
    updatedAt: now,
  };
  await store.create(record);

  return NextResponse.json({ orderHash: record.orderHash, state: record.state });
}

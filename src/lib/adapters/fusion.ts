/**
 * 1inch Fusion destination-leg adapter.
 *
 * The Fusion SDK exposes getOrderStatus(orderHash). The returned `status`
 * enum (verified empirically from observed responses) includes:
 *
 *   pending                          — auction in flight
 *   filled                           — resolver settled the order
 *   expired                          — auction window passed without a fill
 *   false-predicate                  — predicate (e.g. maker balance) didn't hold
 *   not-enough-balance-or-allowance  — maker didn't have funds when resolver tried
 *   invalid-signature                — order signature didn't recover to maker
 *   cancelled                        — order was cancelled (gracefully or by 1inch)
 *
 * For our purposes, the latter four collapse into `failed` with the original
 * status string preserved as `failureReason` for the integrator. They all
 * mean "USDC is now on Ethereum, sitting in the user's wallet, and no fill
 * happened" — same recovery path: integrator prompts a new order (or surfaces
 * the specific reason if they want to be more helpful).
 *
 * We construct the SDK lazily so the module imports cleanly even when
 * DEV_PORTAL_API_TOKEN isn't set (e.g. during static build).
 */

import { FusionSDK, NetworkEnum } from '@1inch/fusion-sdk';
import type { DestinationPoll } from '../types';

let sdkSingleton: FusionSDK | null = null;

function getSdk(): FusionSDK {
  if (sdkSingleton) return sdkSingleton;
  const authKey = process.env.DEV_PORTAL_API_TOKEN;
  if (!authKey) throw new Error('DEV_PORTAL_API_TOKEN not configured');
  sdkSingleton = new FusionSDK({
    url: 'https://api.1inch.dev/fusion',
    network: NetworkEnum.ETHEREUM,
    authKey,
  });
  return sdkSingleton;
}

function mapFusionStatus(s: string): DestinationPoll['state'] {
  if (s === 'filled') return 'filled';
  if (s === 'pending') return 'pending';
  if (s === 'expired') return 'expired';
  return 'failed';
}

export async function pollFusionStatus(orderHash: string): Promise<DestinationPoll> {
  const sdk = getSdk();
  // The SDK's getOrderStatus returns a typed response, but the shape varies
  // slightly across versions. We narrow defensively.
  const raw = (await sdk.getOrderStatus(orderHash)) as unknown as {
    status: string;
    fills?: Array<{ txHash?: string; filledMakerAmount?: string }>;
  };

  const state = mapFusionStatus(raw.status);
  const firstFill = raw.fills?.[0];

  return {
    state,
    fillTxHash: firstFill?.txHash,
    filledAmount: firstFill?.filledMakerAmount,
    failureReason: state === 'failed' ? raw.status : undefined,
  };
}

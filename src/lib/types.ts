/**
 * Async order tracking layer — types
 *
 * Models a cross-chain intent settled via Across: USDC bridges from an
 * origin chain to a destination chain, then a destination strategy (1inch
 * Fusion today; CoW / Hashflow / Fusion+ tomorrow) converts that USDC into
 * the user's intended output asset.
 *
 * Why this exists: ether.fi's Shivam, on the Fusion direct-integration ask:
 *   "We would ideally want Across to handle the async states. And refunds in
 *    case of issues."
 *
 * This layer owns the unified state machine and surfaces a single endpoint
 * the integrator polls to know whether they should wait, retry, or recover.
 */

export type State =
  // Both legs in flight: Across is delivering, destination is in auction.
  | 'pending'
  // Across delivered USDC; destination strategy is still active.
  | 'bridge_complete'
  // Terminal SUCCESS: destination asset delivered to recipient.
  | 'destination_filled'
  // Terminal: destination auction window passed without a fill. USDC sits in
  // recipient wallet on destination chain. Integrator should prompt a new order.
  | 'destination_expired'
  // Terminal: destination strategy rejected the order
  // (false-predicate / invalid-signature / not-enough-balance / cancelled / etc.)
  | 'destination_failed'
  // Terminal: Across deposit was never filled within the deadline; SpokePool
  // refunded the USDC to the depositor on the origin chain. No user action.
  | 'bridge_refunded';

export const TERMINAL_STATES: ReadonlyArray<State> = [
  'destination_filled',
  'destination_expired',
  'destination_failed',
  'bridge_refunded',
] as const;

export function isTerminal(s: State): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(s);
}

/**
 * What action (if any) the integrator should surface to the user.
 *   wait                    — non-terminal, keep polling
 *   none                    — terminal success
 *   retry                   — terminal, USDC still on destination, user can place a new order
 *   manual_action_required  — terminal failure with case-specific recovery (see failureReason)
 *   auto_refunded           — terminal, Across already returned funds to origin wallet
 */
export type RecoveryPath =
  | 'wait'
  | 'none'
  | 'retry'
  | 'manual_action_required'
  | 'auto_refunded';

/**
 * Destination strategies — extension point for CoW / Hashflow / Fusion+.
 * Each strategy has a paired adapter in src/lib/adapters/.
 */
export type Strategy = 'fusion-same-chain';

/**
 * Persisted record. One per orderHash. Stored under key `order:{orderHash}`
 * in KV. Active (non-terminal) orderHashes are also tracked in a Redis SET
 * under key `active` so the daily sweep can iterate them.
 */
export type OrderRecord = {
  orderHash: string;
  strategy: Strategy;
  state: State;

  // Origin leg (Across)
  originChainId: number;
  depositId: string;
  depositTxHash: string;
  bridgeFillTxHash?: string;

  // Destination leg (Fusion / etc.)
  destinationChainId: number;
  destinationFillTxHash?: string;
  destinationFilledAmount?: string; // wei/units, string-encoded

  // Order intent
  userAddress: string;
  expectedDeliveryAmount: string; // minimum output the user signed for, units string

  // Diagnostics
  failureReason?: string;
  lastPolledAt: number; // unix ms; 0 means never polled
  createdAt: number;
  updatedAt: number;

  // Out of scope for v1; reserved for webhook dispatch in v2.
  webhookUrl?: string;
};

/**
 * Lightweight responses returned by the upstream adapters. Each adapter
 * normalizes provider-specific status enums into this shape so the state
 * machine can stay provider-agnostic.
 */
export type BridgePoll = {
  status: 'pending' | 'filled' | 'refunded';
  fillTxHash?: string;
};

export type DestinationPoll = {
  state: 'pending' | 'filled' | 'expired' | 'failed';
  fillTxHash?: string;
  filledAmount?: string;
  failureReason?: string;
};

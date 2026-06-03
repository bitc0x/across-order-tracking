/**
 * State machine — forward-only transitions, terminal states absorb.
 *
 * Reads: current OrderRecord + latest BridgePoll + latest DestinationPoll
 * Writes: next State (and updates the *FillTxHash / failureReason fields on
 *         the record at the call site).
 *
 * Priority rules (highest wins):
 *   1. Bridge refunded                  → bridge_refunded        (terminal)
 *   2. Destination filled               → destination_filled     (terminal)
 *   3. Destination expired              → destination_expired    (terminal)
 *   4. Destination failed               → destination_failed     (terminal)
 *   5. Bridge filled (state was pending)→ bridge_complete        (non-terminal)
 *   6. (no change)                      → record.state
 *
 * Terminal states absorb: once a record is terminal we don't transition out.
 *
 * Order of evaluation reflects what the integrator most needs to know about.
 * A destination_filled trumps everything else because it means user got their
 * asset; a bridge_refunded trumps destination_failed because the recovery
 * path differs materially (auto_refunded vs manual_action_required).
 */

import type {
  BridgePoll,
  DestinationPoll,
  OrderRecord,
  RecoveryPath,
  State,
} from './types';
import { isTerminal } from './types';

export function computeNextState(
  current: State,
  bridge: BridgePoll | null,
  destination: DestinationPoll | null,
): State {
  // Terminal states absorb — never transition out.
  if (isTerminal(current)) return current;

  // Highest priority: bridge refunded (Across timed out, USDC back on origin).
  if (bridge?.status === 'refunded') return 'bridge_refunded';

  // Destination terminal states.
  if (destination?.state === 'filled') return 'destination_filled';
  if (destination?.state === 'expired') return 'destination_expired';
  if (destination?.state === 'failed') return 'destination_failed';

  // Bridge progress (non-terminal).
  if (bridge?.status === 'filled' && current === 'pending') return 'bridge_complete';

  return current;
}

export function computeRecoveryPath(state: State): RecoveryPath {
  switch (state) {
    case 'pending':
    case 'bridge_complete':
      return 'wait';
    case 'destination_filled':
      return 'none';
    case 'destination_expired':
      return 'retry';
    case 'destination_failed':
      return 'manual_action_required';
    case 'bridge_refunded':
      return 'auto_refunded';
  }
}

/**
 * Apply poll results to a record in place, returning whether anything changed.
 * Used by both the status endpoint (lazy poll on GET) and the daily cron sweep.
 */
export function applyPolls(
  record: OrderRecord,
  bridge: BridgePoll | null,
  destination: DestinationPoll | null,
): { changed: boolean; transitioned: boolean } {
  const prevState = record.state;
  const nextState = computeNextState(prevState, bridge, destination);
  let changed = false;

  if (bridge?.fillTxHash && bridge.fillTxHash !== record.bridgeFillTxHash) {
    record.bridgeFillTxHash = bridge.fillTxHash;
    changed = true;
  }
  if (destination?.fillTxHash && destination.fillTxHash !== record.destinationFillTxHash) {
    record.destinationFillTxHash = destination.fillTxHash;
    changed = true;
  }
  if (destination?.filledAmount && destination.filledAmount !== record.destinationFilledAmount) {
    record.destinationFilledAmount = destination.filledAmount;
    changed = true;
  }
  if (destination?.failureReason && destination.failureReason !== record.failureReason) {
    record.failureReason = destination.failureReason;
    changed = true;
  }

  const transitioned = nextState !== prevState;
  if (transitioned) {
    record.state = nextState;
    changed = true;
  }

  if (changed) record.updatedAt = Date.now();
  record.lastPolledAt = Date.now();
  return { changed, transitioned };
}

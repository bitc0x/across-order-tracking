# Across Order Tracking

Async order tracking and recovery semantics for cross-chain intents settled via Across.

Built in direct response to ether.fi (Shivam Agrawal) on the Fusion direct-integration scoping:

> "We would ideally want Across to handle the async states. And refunds in case of issues."

The user-facing UX is already proven by the [ether.fi PoC](https://etherfi-cash-across-poc.vercel.app). What integrators actually need from a direct destination-protocol integration is the operational layer underneath: who owns the order lifecycle, who tells the integrator when to wait vs retry vs surface an error, who handles refunds. This repo is that layer.

## Architecture

```
integrator backend                    this layer                    upstream
─────────────────                     ──────────                    ────────
                                                                    
POST /api/order/submit ─────────────► register order              
                                       └─► state: pending          
                                                                    
GET  /api/order/status/{hash} ──────► lazy poll Across + 1inch ──► Across API
                                       └─► apply state machine      1inch Fusion
                                       └─► return unified state     SDK
                                                                    
                                      (daily cron sweeps stuck orders)
```

**Polling model is lazy on GET**, not background cron. Vercel Hobby caps cron to 1/day; the integrator polls the status endpoint at whatever cadence their UI needs, and the first GET after 5s of cache TTL triggers an upstream poll of both Across and 1inch in parallel. This scales polling pressure to integrator interest rather than running idle work, and works on any Vercel plan.

A daily sweep cron exists at `/api/cron/sweep` as a safety net for orders nobody queries.

## State machine

| state | terminal | recoveryPath | meaning |
|---|---|---|---|
| `pending` | no | `wait` | both legs in flight |
| `bridge_complete` | no | `wait` | Across delivered, destination still in auction |
| `destination_filled` | yes | `none` | success: destination asset delivered |
| `destination_expired` | yes | `retry` | auction window passed, USDC sits in user wallet on destination chain |
| `destination_failed` | yes | `manual_action_required` | order rejected (see `failureReason`) |
| `bridge_refunded` | yes | `auto_refunded` | Across deposit timed out, USDC returned to depositor on origin |

Forward-only transitions. Terminal states absorb. Priority order on a poll: bridge refunded > destination filled > destination expired > destination failed > bridge filled (→ bridge_complete).

## API

### `POST /api/order/submit`

Register an order for tracking. Call once immediately after the order is submitted to 1inch and the Across deposit is broadcast on origin. Idempotent on `orderHash`.

```json
{
  "strategy": "fusion-same-chain",
  "orderHash": "0x...",
  "originChainId": 10,
  "destinationChainId": 1,
  "depositId": "3686721",
  "depositTxHash": "0xf885...",
  "userAddress": "0xd480...",
  "expectedDeliveryAmount": "13574000000000000"
}
```

Response: `{ "orderHash": "0x...", "state": "pending" }`.

### `GET /api/order/status/{orderHash}`

Returns unified state across both legs. First call after a stale TTL triggers upstream polling.

```json
{
  "orderHash": "0x...",
  "strategy": "fusion-same-chain",
  "state": "destination_filled",
  "recoveryPath": "none",
  "bridge": {
    "originChainId": 10,
    "depositId": "3686721",
    "depositTxHash": "0xf885...",
    "fillTxHash": "0x9aa1..."
  },
  "destination": {
    "destinationChainId": 1,
    "fillTxHash": "0x3a3d...",
    "filledAmount": "13574000000000000",
    "failureReason": null
  },
  "expectedDeliveryAmount": "13574000000000000",
  "userAddress": "0xd480...",
  "createdAt": 1717245600000,
  "updatedAt": 1717245720000,
  "lastPolledAt": 1717245720000
}
```

## Quickstart

Test the live API in 30 seconds with one historical filled order:

```bash
BASE=https://across-order-tracking.vercel.app
HASH=0xa193327025ccf94a06a632e49e4b899c143066d55f1baf4d179d51839ca585e0

# 1. Register the order (idempotent — safe to re-run)
curl -X POST "$BASE/api/order/submit" \
  -H "Content-Type: application/json" \
  -d "{
    \"strategy\": \"fusion-same-chain\",
    \"orderHash\": \"$HASH\",
    \"originChainId\": 10,
    \"destinationChainId\": 1,
    \"depositId\": \"3685984\",
    \"depositTxHash\": \"0x59f2db787e36627a363c1012044d52b3bf1bab6276530c2a2bd421b73b653330\",
    \"userAddress\": \"0xd48010de315e10d071853b1466f0c273e766fa07\",
    \"expectedDeliveryAmount\": \"17618193350299789\"
  }"

# 2. Fetch unified status (first call lazily polls upstream; subsequent
#    calls within 5s return cached state)
curl "$BASE/api/order/status/$HASH"
```

You should see `state: "destination_filled"` and both `bridge.fillTxHash` and `destination.fillTxHash` populated.

## Integration notes

- **CORS**: wildcard origin. The API is callable directly from any integrator frontend without preflight failures. `Access-Control-Allow-Origin: *`, `Methods: GET, POST, OPTIONS`, `Headers: Content-Type, Authorization`, `Max-Age: 86400` (so the preflight result caches for 24h). No `Allow-Credentials` (incompatible with wildcard origin anyway).
- **Auth**: none in v1 — public-write API. The cost of a malicious POST is low (it just registers an order to track). API-key gating belongs at a future auth layer if/when this gets multi-tenant.
- **Rate limits**: none currently. The lazy-poll-on-GET architecture means upstream pressure scales to integrator query interest rather than running idle work.

## Adding a new destination strategy

The state machine and store are strategy-agnostic. To add CoW, Hashflow, or Fusion+:

1. Add a new adapter at `src/lib/adapters/{name}.ts` that exports `pollDestinationStatus(orderHash): Promise<DestinationPoll>`.
2. Extend the `Strategy` union in `src/lib/types.ts`.
3. Branch on `record.strategy` in the lazy-poll path and the cron sweep to dispatch to the right adapter.

No state machine changes needed — every strategy normalizes to the same `DestinationPoll` shape (pending / filled / expired / failed + tx hash + amount + reason).

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DEV_PORTAL_API_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, CRON_SECRET
npm run dev
```

## Deployment

1. Push to GitHub, import into Vercel.
2. Provision Upstash Redis: Storage tab → Browse Marketplace → "Upstash for Redis" → connect to project. Auto-injects `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*` for migrated stores — both supported).
3. Add `DEV_PORTAL_API_TOKEN` (1inch dev portal key, same as the PoC uses).
4. Add `CRON_SECRET` (any random ≥32-char string).
5. Deploy. The `vercel.json` cron entry registers the daily sweep automatically.

## Roadmap

- v1 (this repo): 1inch Fusion adapter on Ethereum destination, Across origin.
- v2: webhook dispatch on terminal transitions (the `webhookUrl` field on `OrderRecord` is reserved for this — currently ignored).
- v3: integrator API key auth, multi-tenant isolation.
- v4: additional destination adapters (CoW, Hashflow, Fusion+). 

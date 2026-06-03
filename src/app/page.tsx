/**
 * Landing page. Two audiences:
 *   1. Integrator engineers reading the source / the live page to understand
 *      how to call the API.
 *   2. ether.fi (Shivam) seeing the artifact at a glance.
 *
 * No analytics, no marketing fluff. Direct, technical, calibrated to the
 * audience.
 */

import StatusChecker from '@/components/StatusChecker';

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-sm gold-text font-semibold tracking-wide">Across</span>
            <span className="text-xs cream-500">/</span>
            <span className="text-sm cream-100 font-semibold">Order Tracking</span>
          </div>
          <a
            href="https://github.com/bitc0x/across-order-tracking"
            target="_blank"
            rel="noreferrer"
            className="text-xs cream-400 hover:text-cream-100 transition-colors"
          >
            github &rarr;
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12">
        <div className="text-[11px] uppercase tracking-widest gold-text font-semibold mb-3">
          Async order tracking layer
        </div>
        <h1 className="serif text-4xl md:text-5xl text-cream-50 leading-[1.05] tracking-tight mb-5">
          Cross-chain intents,<br />async states owned upstream.
        </h1>
        <p className="cream-300 max-w-3xl text-base md:text-lg leading-relaxed">
          A small API the integrator calls on order submit, then polls for unified
          bridge + destination status with recovery semantics. Solves the operational
          half of direct destination-protocol integrations &mdash; the half end-users
          never see, but engineering and ops feel every day.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-xs cream-400 bg-card rounded-full px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
          v1 ships 1inch Fusion. CoW, Hashflow, Fusion+ drop into the same adapter shape.
        </div>
      </section>

      {/* The ask we're answering */}
      <section className="max-w-5xl mx-auto px-6 pb-12">
        <div className="bg-card rounded-xl p-6">
          <div className="text-[10px] uppercase tracking-widest cream-500 mb-3">
            The integrator&rsquo;s ask
          </div>
          <blockquote className="serif text-lg cream-100 leading-relaxed">
            &ldquo;We would ideally want Across to handle the async states. And refunds
            in case of issues.&rdquo;
          </blockquote>
          <div className="text-xs cream-500 mt-3">
            &mdash; ether.fi, on direct Fusion / Paxos integration scoping
          </div>
        </div>
      </section>

      {/* State machine */}
      <section className="max-w-5xl mx-auto px-6 pb-12">
        <h2 className="text-[11px] uppercase tracking-widest gold-text font-semibold mb-4">
          State machine
        </h2>
        <div className="bg-card rounded-xl p-6 mono text-xs leading-relaxed cream-200 whitespace-pre overflow-x-auto">
{`pending ──────┬─► bridge_complete ──┬─► destination_filled    ◀── terminal: SUCCESS
              │                     │
              │                     ├─► destination_expired   ◀── terminal: retry
              │                     │
              │                     └─► destination_failed    ◀── terminal: case-specific recovery
              │
              ├─► destination_filled                            ◀── (both settled within one poll)
              ├─► destination_expired
              ├─► destination_failed
              └─► bridge_refunded                               ◀── terminal: auto-refunded to origin`}
        </div>
      </section>

      {/* Recovery paths */}
      <section className="max-w-5xl mx-auto px-6 pb-12">
        <h2 className="text-[11px] uppercase tracking-widest gold-text font-semibold mb-4">
          Recovery paths
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {[
            { state: 'destination_filled', path: 'none', note: 'Asset delivered. No action.' },
            { state: 'destination_expired', path: 'retry', note: 'USDC sits on destination chain in user wallet. Integrator prompts new order at fresh price.' },
            { state: 'destination_failed', path: 'manual_action_required', note: 'failureReason carries the specific cause (false-predicate / not-enough-balance / invalid-signature / cancelled).' },
            { state: 'bridge_refunded', path: 'auto_refunded', note: 'Across SpokePool returned funds to the depositor address. No action.' },
          ].map((r) => (
            <div key={r.state} className="bg-card rounded-xl p-5">
              <div className="mono text-xs gold-text mb-1">{r.state}</div>
              <div className="text-sm cream-100 font-semibold mb-1">{r.path}</div>
              <div className="text-xs cream-400 leading-relaxed">{r.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* API reference */}
      <section className="max-w-5xl mx-auto px-6 pb-12">
        <h2 className="text-[11px] uppercase tracking-widest gold-text font-semibold mb-4">
          API
        </h2>

        <div className="bg-card rounded-xl p-6 mb-4">
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-xs gold-text font-semibold">POST</span>
            <span className="mono text-sm cream-100">/api/order/submit</span>
          </div>
          <p className="text-sm cream-300 mb-3 leading-relaxed">
            Register an order for tracking. Call once, immediately after submitting
            the Fusion order to 1inch and broadcasting the Across deposit on origin.
            Idempotent on orderHash.
          </p>
          <div className="mono text-xs bg-deep rounded p-4 cream-200 overflow-x-auto whitespace-pre">
{`{
  "strategy": "fusion-same-chain",
  "orderHash": "0x...",                       // 1inch Fusion order hash
  "originChainId": 10,                        // 10 = Optimism
  "destinationChainId": 1,                    // 1 = Ethereum
  "depositId": "3686721",                     // from V3FundsDeposited event
  "depositTxHash": "0xf885...",               // origin tx hash
  "userAddress": "0xd480...",                 // order maker
  "expectedDeliveryAmount": "13574000000000000"  // min output in wei
}`}
          </div>
        </div>

        <div className="bg-card rounded-xl p-6">
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-xs gold-text font-semibold">GET</span>
            <span className="mono text-sm cream-100">/api/order/status/{'{orderHash}'}</span>
          </div>
          <p className="text-sm cream-300 mb-3 leading-relaxed">
            Returns unified state. First call after submit triggers upstream polling
            of Across + 1inch in parallel; subsequent calls within 5s reuse the
            cached state. Integrator polls at whatever cadence their UI needs.
          </p>
          <div className="mono text-xs bg-deep rounded p-4 cream-200 overflow-x-auto whitespace-pre">
{`{
  "orderHash": "0x...",
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
}`}
          </div>
        </div>
      </section>

      {/* Live status checker — useful for demoing the API end-to-end */}
      <section className="max-w-5xl mx-auto px-6 pb-12">
        <h2 className="text-[11px] uppercase tracking-widest gold-text font-semibold mb-4">
          Live status checker
        </h2>
        <p className="text-sm cream-300 mb-4 max-w-2xl leading-relaxed">
          Paste an orderHash that was registered via POST /api/order/submit. The
          checker hits GET /api/order/status/{'{orderHash}'} and displays the
          response. Same call any integrator backend would make.
        </p>
        <StatusChecker />
      </section>

      <footer className="max-w-5xl mx-auto px-6 py-8 border-t border-white/[0.06]">
        <div className="text-xs cream-500 flex flex-wrap gap-x-6 gap-y-2">
          <a href="https://across.to" target="_blank" rel="noreferrer" className="hover:text-cream-100">
            across.to
          </a>
          <a href="https://docs.across.to" target="_blank" rel="noreferrer" className="hover:text-cream-100">
            docs
          </a>
          <a
            href="https://etherfi-cash-across-poc.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="hover:text-cream-100"
          >
            ether.fi PoC
          </a>
        </div>
      </footer>
    </main>
  );
}

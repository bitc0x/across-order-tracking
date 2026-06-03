/**
 * Status checker. Client-side component that hits our own GET endpoint.
 *
 * Useful for two purposes:
 *   1. Sanity-checking the API end-to-end without curl.
 *   2. Demoing the response shape live during the ether.fi pitch.
 */

'use client';

import { useState } from 'react';

type StatusResponse = {
  orderHash: string;
  state: string;
  recoveryPath: string;
  bridge: { originChainId: number; depositId: string; depositTxHash: string; fillTxHash: string | null };
  destination: { destinationChainId: number; fillTxHash: string | null; filledAmount: string | null; failureReason: string | null };
  expectedDeliveryAmount: string;
  userAddress: string;
  createdAt: number;
  updatedAt: number;
  lastPolledAt: number;
};

const STATE_COLORS: Record<string, string> = {
  pending: 'text-amber-400 bg-amber-400/10',
  bridge_complete: 'text-sky-400 bg-sky-400/10',
  destination_filled: 'text-emerald-400 bg-emerald-400/10',
  destination_expired: 'text-orange-400 bg-orange-400/10',
  destination_failed: 'text-red-400 bg-red-400/10',
  bridge_refunded: 'text-cyan-400 bg-cyan-400/10',
};

export default function StatusChecker() {
  const [orderHash, setOrderHash] = useState('');
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchStatus() {
    if (!orderHash.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/order/status/${encodeURIComponent(orderHash.trim())}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `HTTP ${res.status}`);
      } else {
        setData(body as StatusResponse);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') fetchStatus();
  }

  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={orderHash}
          onChange={(e) => setOrderHash(e.target.value)}
          onKeyDown={handleKey}
          placeholder="0x... orderHash"
          className="flex-1 bg-deep rounded-lg px-3 py-2 text-sm mono cream-100 placeholder:cream-500 outline-none focus:border-gold-500/50"
        />
        <button
          onClick={fetchStatus}
          disabled={loading || !orderHash.trim()}
          className="bg-gold-500/20 hover:bg-gold-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-gold-300 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? 'fetching…' : 'check status'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-400/10 rounded p-3 mono">{error}</div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 mono text-xs font-semibold px-2.5 py-1 rounded-full ${STATE_COLORS[data.state] ?? 'text-cream-300 bg-white/5'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {data.state}
            </span>
            <span className="text-xs cream-400">
              recovery: <span className="cream-100 mono">{data.recoveryPath}</span>
            </span>
            <span className="text-xs cream-500 ml-auto">
              updated {new Date(data.updatedAt).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-deep rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest cream-500 mb-2">Origin (Across)</div>
              <div className="text-xs cream-400 mb-1">chain {data.bridge.originChainId} · depositId {data.bridge.depositId}</div>
              <div className="mono text-xs cream-200 break-all">
                <span className="cream-500">deposit: </span>
                {data.bridge.depositTxHash.slice(0, 18)}…{data.bridge.depositTxHash.slice(-8)}
              </div>
              {data.bridge.fillTxHash && (
                <div className="mono text-xs cream-200 break-all mt-1">
                  <span className="cream-500">fill: </span>
                  {data.bridge.fillTxHash.slice(0, 18)}…{data.bridge.fillTxHash.slice(-8)}
                </div>
              )}
            </div>
            <div className="bg-deep rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest cream-500 mb-2">Destination (Fusion)</div>
              <div className="text-xs cream-400 mb-1">chain {data.destination.destinationChainId}</div>
              {data.destination.fillTxHash ? (
                <div className="mono text-xs cream-200 break-all">
                  <span className="cream-500">fill: </span>
                  {data.destination.fillTxHash.slice(0, 18)}…{data.destination.fillTxHash.slice(-8)}
                </div>
              ) : (
                <div className="text-xs cream-500">not yet filled</div>
              )}
              {data.destination.filledAmount && (
                <div className="text-xs cream-400 mt-1">
                  filled {data.destination.filledAmount}
                </div>
              )}
              {data.destination.failureReason && (
                <div className="text-xs text-red-300 mt-2 mono">
                  reason: {data.destination.failureReason}
                </div>
              )}
            </div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer cream-400 hover:cream-100">raw response</summary>
            <pre className="mono text-xs cream-300 bg-deep rounded p-3 mt-2 overflow-x-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

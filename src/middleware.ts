/**
 * CORS middleware for the integrator-facing API.
 *
 * The tracking layer is meant to be called from integrator frontends (the
 * ether.fi PoC at etherfi-cash-across-poc.vercel.app is the first one) AND
 * integrator backends. Browser-originating POSTs from a different origin
 * trigger a CORS preflight (OPTIONS) that Next.js doesn't satisfy by default,
 * so the fetch never reaches our route handler.
 *
 * Policy: Access-Control-Allow-Origin: *. This is a public-write API where
 * the cost of a malicious POST is low (it just registers an order to track).
 * Auth gating belongs at a future API-key layer, not at CORS.
 *
 * The middleware intercepts every /api/* request:
 *   - OPTIONS → 204 with the CORS headers (preflight satisfied)
 *   - Any other method → response from the route handler, augmented with
 *     CORS headers so the browser surfaces it to the caller.
 *
 * The cron endpoint at /api/cron/sweep also gets CORS headers, which is
 * harmless — that endpoint has its own Bearer-token auth check.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export function middleware(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

export const config = {
  matcher: '/api/:path*',
};

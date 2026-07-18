import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMediaTokenAuth } from '@/lib/api-utils';
import { immichFetch } from '@/lib/immich';

export const dynamic = 'force-dynamic';

/**
 * GET /api/immich/video?assetId=<uuid>&mt=<token>
 *
 * Streaming proxy to Immich's video playback endpoint. The incoming Range
 * header is forwarded and the response body is piped straight through — never
 * buffered, and never entering the 24h ArrayBuffer cache the thumbnail route
 * uses (a whole video in that cache would OOM the hub). Auth accepts the
 * usual display credentials or an `mt` media token bound to this assetId,
 * because a bare <video src> cannot send a Bearer header.
 */

/** Headers passed through from Immich so seeking and progress work. */
const PASSTHROUGH_HEADERS = ['content-type', 'content-range', 'content-length', 'accept-ranges'];

/** Playback outlives the thumbnail route's 15s budget; give streams 15 minutes. */
const PLAYBACK_TIMEOUT_MS = 15 * 60_000;

export const GET = withMediaTokenAuth(async (request: NextRequest) => {
  const assetId = request.nextUrl.searchParams.get('assetId');
  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });
  if (!/^[a-f0-9-]+$/i.test(assetId)) return NextResponse.json({ error: 'Invalid assetId' }, { status: 400 });

  const range = request.headers.get('range');
  const res = await immichFetch(`/api/assets/${assetId}/video/playback`, {
    headers: range ? { Range: range } : undefined,
    timeout: PLAYBACK_TIMEOUT_MS,
    retries: 0, // never re-request a half-consumed stream
    // Tear down the upstream socket the moment the kiosk aborts (rotation,
    // src swap) — otherwise a stalled stream lingers for the full timeout.
    signal: request.signal,
  });

  // 416 passes through (with its Content-Range) so the browser can correct
  // an out-of-bounds range request instead of seeing an opaque 502.
  if (!res.ok && res.status !== 206 && res.status !== 416) {
    return NextResponse.json({ error: 'Failed to fetch video from Immich' }, { status: 502 });
  }

  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(res.body, { status: res.status, headers });
}, 'Failed to stream Immich video', (request) => request.nextUrl.searchParams.get('assetId'));

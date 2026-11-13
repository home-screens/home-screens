import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchWithTimeout, withMediaTokenAuth } from '@/lib/api-utils';
import { findICloudItem, icloudMediaResource, isICloudAlbumLink } from '@/lib/icloud-media';
import { isAppleContentUrl } from '@/lib/icloud-parse';
import { isPlayableUpstream, PLAYBACK_TIMEOUT_MS, videoPassthrough } from '@/lib/video-proxy';

export const dynamic = 'force-dynamic';

/**
 * GET /api/icloud/video?link=<album link>&id=<guid>&mt=<token>
 *
 * Streaming proxy for one video of a shared album. The display never holds
 * Apple's signed URL, which dies within the hour: every request, each seek
 * included, reads the current one from the album the hub keeps. The incoming
 * Range header is forwarded and the body piped straight through. Auth accepts
 * the usual display credentials or an `mt` media token bound to this album
 * item, because a bare <video src> cannot send a Bearer header.
 */
export const GET = withMediaTokenAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const link = params.get('link');
  const id = params.get('id');
  if (!link || !id) return NextResponse.json({ error: 'link and id required' }, { status: 400 });
  if (!isICloudAlbumLink(link)) return NextResponse.json({ error: 'Invalid link' }, { status: 400 });

  const item = await findICloudItem(link, id);
  if (!item || item.type !== 'video') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isAppleContentUrl(item.url)) return NextResponse.json({ error: 'Failed to fetch video from iCloud' }, { status: 502 });

  const range = request.headers.get('range');
  const res = await fetchWithTimeout(item.url, {
    headers: range ? { Range: range } : undefined,
    timeout: PLAYBACK_TIMEOUT_MS,
    retries: 0, // never re-request a half-consumed stream
    // Tear down the upstream socket the moment the kiosk aborts (rotation,
    // src swap) — otherwise a stalled stream lingers for the full timeout.
    signal: request.signal,
  });
  if (!isPlayableUpstream(res)) {
    return NextResponse.json({ error: 'Failed to fetch video from iCloud' }, { status: 502 });
  }
  return videoPassthrough(res);
}, 'Failed to stream iCloud video', (request) => {
  const params = request.nextUrl.searchParams;
  const link = params.get('link');
  const id = params.get('id');
  return link && id ? icloudMediaResource(link, id) : null;
});

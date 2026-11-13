/**
 * The passthrough half of a streaming video proxy, shared by the routes that
 * play a video the hub holds the credentials or the signed link for (Immich,
 * iCloud). The upstream body is piped straight through, never buffered: a
 * whole video in memory would OOM the hub.
 */

/** Headers passed through from the upstream so seeking and progress work. */
const PASSTHROUGH_HEADERS = ['content-type', 'content-range', 'content-length', 'accept-ranges'];

/** Playback outlives a picture fetch's budget; give streams 15 minutes. */
export const PLAYBACK_TIMEOUT_MS = 15 * 60_000;

/**
 * Whether an upstream answer is one to pass on. 206 is a range; 416 passes
 * through (with its Content-Range) so the browser can correct an
 * out-of-bounds range request instead of seeing an opaque 502.
 */
export function isPlayableUpstream(res: Response): boolean {
  return res.ok || res.status === 206 || res.status === 416;
}

/** The upstream answer as the hub's own, body unread. */
export function videoPassthrough(res: Response): Response {
  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(res.body, { status: res.status, headers });
}

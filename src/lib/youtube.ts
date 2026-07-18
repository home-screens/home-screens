/**
 * YouTube URL handling for the video module. YouTube content can't play
 * through a bare <video> element, so URLs that parse here render the iframe
 * embed player instead (privacy-enhanced youtube-nocookie.com host).
 */

/** YouTube video IDs are 11 chars of [A-Za-z0-9_-]. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/**
 * Extract the video ID from any common YouTube URL shape:
 *   https://www.youtube.com/watch?v=ID (+ extra params)
 *   https://youtu.be/ID
 *   https://www.youtube.com/shorts/ID
 *   https://www.youtube.com/embed/ID
 *   https://www.youtube.com/live/ID
 * Returns null for anything else (including bare non-URL strings).
 */
export function parseYouTubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const host = parsed.hostname.toLowerCase();

  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/')[1] ?? '';
    return VIDEO_ID_RE.test(id) ? id : null;
  }

  if (!YOUTUBE_HOSTS.has(host)) return null;

  const v = parsed.searchParams.get('v');
  if (v && VIDEO_ID_RE.test(v)) return v;

  const pathMatch = /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/.exec(parsed.pathname);
  return pathMatch ? pathMatch[1] : null;
}

/**
 * Build the kiosk embed URL. Controls, keyboard, and fullscreen are disabled
 * (nobody is there to click); `loop` requires the single-video playlist trick.
 * Autoplay-with-sound additionally relies on the kiosk launcher's
 * --autoplay-policy flag, same as the <video> path.
 */
export function buildYouTubeEmbedUrl(
  videoId: string,
  opts: { muted: boolean; loop: boolean },
): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: opts.muted ? '1' : '0',
    controls: '0',
    disablekb: '1',
    fs: '0',
    playsinline: '1',
    rel: '0',
    iv_load_policy: '3',
  });
  if (opts.loop) {
    params.set('loop', '1');
    params.set('playlist', videoId);
  }
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}

/** Thumbnail used as the editor poster frame (no player loads in the editor). */
export function youTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

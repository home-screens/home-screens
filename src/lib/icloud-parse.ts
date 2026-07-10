/**
 * Pure parsers for the two kinds of Apple photo-sharing links. Client-safe on
 * purpose (no server imports): the editor uses the SAME detection the server
 * acts on, so "what kind of link did the user paste?" can never drift between
 * the paste-time UI hints and the import/list endpoints.
 *
 *   Shared Album  icloud.com/sharedalbum/#TOKEN      → live slideshow source
 *   iCloud Link   share.icloud.com/photos/TOKEN      → import-only (expires ~30 days)
 *                 icloud.com/photos/#/icloudlinks/TOKEN
 */

/**
 * Extract the album token from a share link (icloud.com/sharedalbum/#TOKEN)
 * or accept a bare token. Returns null when nothing token-shaped is found.
 */
export function parseICloudAlbumToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hashIndex = trimmed.indexOf('#');
  const candidate = (hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : trimmed)
    // Sub-album share links append ";suffix" — the base token still resolves.
    .split(';')[0]
    .trim();
  return /^[A-Za-z0-9]{6,128}$/.test(candidate) ? candidate : null;
}

/**
 * Extract the short GUID from an iCloud Link. Accepted forms:
 *   https://share.icloud.com/photos/TOKEN
 *   https://www.icloud.com/photos/#/icloudlinks/TOKEN
 *   bare TOKEN
 */
export function parseICloudLinkToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex >= 0) {
    // #/icloudlinks/TOKEN or a bare #TOKEN fragment
    candidate = trimmed.slice(hashIndex + 1);
  } else if (trimmed.includes('/')) {
    // share.icloud.com/photos/TOKEN — token is the last path segment
    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      candidate = url.pathname;
    } catch {
      return null;
    }
  }
  const segments = candidate.split('/').filter(Boolean);
  const token = segments[segments.length - 1] ?? '';
  return /^[A-Za-z0-9_-]{10,128}$/.test(token) ? token : null;
}

/**
 * Which Apple product a pasted link belongs to. Shared Album links carry a
 * #TOKEN fragment on /sharedalbum/; iCloud Links live at share.icloud.com or
 * /photos/#/icloudlinks/. Bare tokens disambiguate by charset: album tokens
 * are pure base62, link short-GUIDs contain '-'/'_'.
 */
export function detectICloudSource(url: string): 'album' | 'link' | null {
  if (url.includes('sharedalbum')) {
    return parseICloudAlbumToken(url) ? 'album' : null;
  }
  if (url.includes('share.icloud.com') || url.includes('icloudlinks')) {
    return parseICloudLinkToken(url) ? 'link' : null;
  }
  if (parseICloudAlbumToken(url)) return 'album';
  // The bare-token fallback must stay bare: parseICloudLinkToken takes the
  // last path segment of any URL, so without this guard an extensionless
  // direct-media URL (https://cdn.example.com/media/abc123def456) would
  // classify as an iCloud Link and hide the normal Video URL field.
  if (!url.includes('/') && parseICloudLinkToken(url)) return 'link';
  return null;
}

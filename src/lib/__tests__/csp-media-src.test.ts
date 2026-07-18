import { describe, it, expect } from 'vitest';
// Repo-root config, three levels up from src/lib/__tests__/.
import nextConfig from '../../../next.config.mjs';

/**
 * Slideshow video (iCloud shared albums, remote-URL video) plays from raw
 * cross-origin CDN URLs in a <video> element. Without an explicit media-src,
 * CSP falls back to default-src 'self' and blocks every clip. Guard the
 * directive so a future CSP edit can't silently re-break remote video.
 */
describe('CSP allows remote media', () => {
  it('includes a media-src directive that permits https', async () => {
    if (!nextConfig.headers) throw new Error('next config has no headers()');
    const groups = await nextConfig.headers();
    const catchAll = groups.find((g: { source: string }) => g.source === '/(.*)');
    const csp = catchAll?.headers.find(
      (h: { key: string }) => h.key === 'Content-Security-Policy',
    )?.value as string;

    const mediaSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('media-src'));
    expect(mediaSrc, 'media-src directive present').toBeTruthy();
    // Every source the slideshows rely on: same-origin library files ('self'),
    // object-URL previews (blob:), remote CDNs (https:), LAN servers like
    // Immich (http:), and inline posters (data:) — mirroring img-src.
    for (const source of ["'self'", 'blob:', 'https:', 'http:', 'data:']) {
      expect(mediaSrc, `media-src permits ${source}`).toContain(source);
    }
  });
});

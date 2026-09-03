import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';
import { has, child, count, matches, TINY_GIF, TINY_GIF_2 } from './shared';

/** Phase-1 batch rows — see .claude/plans/2026-07-09-e2e-100-percent-coverage.md.
 *
 * Media & Display / Full Screen modules: qr-code, shape, image, photo-slideshow,
 * fullscreen-photo. Each row flips one (or a tight cluster of) rendering-affecting
 * config field(s) and asserts the exact SVG attribute / DOM marker the field drives.
 */
export const MEDIA_FULLSCREEN_VARIANTS: ConfigVariant[] = [
  // ================= qr-code =================
  {
    // showPassword:false suppresses the password caption below the QR (default shows it).
    type: 'qr-code', name: 'hide-password', kind: 'network-free',
    config: { mode: 'wifi', ssid: 'E2E WIFI NET', password: 'SECRETPW123', showPassword: false },
    expect: async (mod) => {
      await has('E2E WIFI NET')(mod);
      await expect(mod).not.toContainText('SECRETPW123');
    },
  },

  // ================= shape =================
  // -- line edge treatment (endStyle) --
  {
    // 'flat' → solid stroke, no gradient paint (default 'fade' emits a <linearGradient>).
    type: 'shape', name: 'end-style-flat', kind: 'network-free',
    config: { view: 'divider', endStyle: 'flat' },
    expect: async (mod) => { await child('svg line')(mod); await count('svg linearGradient', 0)(mod); },
  },
  {
    // 'rounded' → round line caps (default 'fade' yields butt caps).
    type: 'shape', name: 'end-style-rounded', kind: 'network-free',
    config: { view: 'divider', endStyle: 'rounded' },
    expect: child('svg line[stroke-linecap="round"]'),
  },

  // -- grid pattern + spacing/dot size --
  {
    // 'lines' cell draws full-cell cross lines; the horizontal one starts at x1=0.
    type: 'shape', name: 'grid-lines', kind: 'network-free',
    config: { view: 'grid', gridPattern: 'lines', gridSpacing: 12 },
    expect: child('svg pattern line[x1="0"]'),
  },
  {
    // 'cross' arm = max(2, spacing/6) = 2 at spacing 12, so the h-line starts at x1=6-2=4.
    type: 'shape', name: 'grid-cross', kind: 'network-free',
    config: { view: 'grid', gridPattern: 'cross', gridSpacing: 12 },
    expect: child('svg pattern line[x1="4"]'),
  },
  {
    // Default 'dots' pattern; gridDotSize sets the circle radius.
    type: 'shape', name: 'grid-dot-size', kind: 'network-free',
    config: { view: 'grid', gridDotSize: 5 },
    expect: child('svg pattern circle[r="5"]'),
  },

  // -- dotted-row count + dot size --
  {
    type: 'shape', name: 'dotted-row-count-size', kind: 'network-free',
    config: { view: 'dotted-row', dotCount: 7, dotSize: 8 },
    expect: async (mod) => { await count('svg circle', 7)(mod); await child('svg circle[r="8"]')(mod); },
  },

  // -- geometric stroke / radius / rotation --
  {
    type: 'shape', name: 'stroke-width', kind: 'network-free',
    config: { view: 'rectangle', outline: true, strokeWidth: 6 },
    expect: child('svg rect[stroke-width="6"]'),
  },
  {
    type: 'shape', name: 'corner-radius', kind: 'network-free',
    config: { view: 'rectangle', cornerRadius: 10 },
    expect: child('svg rect[rx="10"]'),
  },
  {
    // Triangle (polygon sides=3). rotation 180 flips the apex from top (y≈1) to bottom (y≈99).
    type: 'shape', name: 'rotation', kind: 'network-free',
    config: { view: 'triangle', rotation: 180 },
    expect: async (mod) => {
      await child('svg polygon')(mod);
      const points = await mod.locator('svg polygon').first().getAttribute('points');
      expect(points || '').toContain('50.000,99.000');
    },
  },
  {
    type: 'shape', name: 'solid-color', kind: 'network-free',
    config: { view: 'rectangle', color: '#ff0000' },
    expect: child('svg rect[fill="#ff0000"]'),
  },

  // -- wave amplitude + frequency --
  {
    // amp 40, freq 1 → the first quarter-cycle peak lands at x=25, y=50+40=90.
    type: 'shape', name: 'wave-amplitude-frequency', kind: 'network-free',
    config: { view: 'wave', waveAmplitude: 40, waveFrequency: 1 },
    expect: async (mod) => {
      await child('svg path')(mod);
      const d = await mod.locator('svg path').first().getAttribute('d');
      expect(d || '').toContain('L25.000 90.000');
    },
  },

  // -- double-line gap --
  {
    // gap 20 → each line offset by ±10 via translate on the horizontal (default) axis.
    type: 'shape', name: 'double-line-gap', kind: 'network-free',
    config: { view: 'double-line', doubleLineGap: 20 },
    expect: child('svg line[transform="translate(0, -10)"]'),
  },

  // -- gradient fill (from / to / angle) --
  {
    // Gradient panel. angle 0 orients the gradient bottom-to-top → y1=1, y2=0.
    type: 'shape', name: 'gradient-colors-angle', kind: 'network-free',
    config: { view: 'gradient', gradientFrom: '#ff0000', gradientTo: '#00ff00', gradientAngle: 0 },
    expect: async (mod) => {
      await child('svg stop[stop-color="#ff0000"]')(mod);
      await child('svg stop[stop-color="#00ff00"]')(mod);
      await child('svg linearGradient[y1="1"][y2="0"]')(mod);
    },
  },

  // -- arrow head ratio --
  {
    // headRatio 0.5 → the arrowhead base starts at x = 100*(1-0.5) = 50.
    type: 'shape', name: 'arrow-head-ratio', kind: 'network-free',
    config: { view: 'arrow', arrowHeadRatio: 0.5 },
    expect: async (mod) => {
      await child('svg path')(mod);
      const d = await mod.locator('svg path').first().getAttribute('d');
      expect(d || '').toContain('L50 15');
    },
  },

  // -- frame bracket length --
  {
    // Brackets. length 50% → the corner segments terminate at 50% of the side.
    type: 'shape', name: 'bracket-length', kind: 'network-free',
    config: { view: 'frame', frameStyle: 'brackets', bracketLength: 50 },
    expect: child('svg line[x2="50%"]'),
  },

  // -- glow softness + intensity --
  {
    // Glow radial gradient: intensity → center stop alpha; softness → falloff stop offset.
    type: 'shape', name: 'glow-softness-intensity', kind: 'network-free',
    config: { view: 'glow', intensity: 0.5, softness: 0.75 },
    expect: async (mod) => {
      await child('svg stop[stop-opacity="0.5"]')(mod);
      await child('svg stop[offset="75%"]')(mod);
    },
  },

  // ================= image =================
  {
    type: 'image', name: 'object-fit-fill', kind: 'network-free',
    config: { src: TINY_GIF, objectFit: 'fill', alt: 'e2e' },
    expect: async (mod) => { await expect(mod.locator('img')).toHaveCSS('object-fit', 'fill'); },
  },

  // ================= photo-slideshow =================
  {
    // Two images + a short interval: the second crossfades in (intervalMs). transition
    // 'none' means the slide layers carry no CSS transition (default 'fade' adds one).
    type: 'photo-slideshow', name: 'no-transition-advance', kind: 'networked', stubKey: 'backgrounds', stubBody: [TINY_GIF, TINY_GIF_2],
    config: { intervalMs: 100, transition: 'none' },
    expect: async (mod) => {
      await expect(mod.locator('img[src$="RAA7"]')).toBeAttached();
      const style = (await mod.locator('img').first().getAttribute('style')) || '';
      expect(style).not.toContain('transition');
    },
  },

  // ================= fullscreen-photo =================
  {
    // Crossfade path with a single image. transition 'none' → no CSS transition;
    // objectFit 'contain' → computed object-fit on the slide <img>.
    type: 'fullscreen-photo', name: 'transition-none-contain', kind: 'networked', stubKey: 'backgrounds', stubBody: [TINY_GIF],
    config: { transition: 'none', objectFit: 'contain' },
    expect: async (mod) => {
      const img = mod.locator('img').first();
      await expect(img).toBeAttached();
      await expect(img).toHaveCSS('object-fit', 'contain');
      const style = (await img.getAttribute('style')) || '';
      expect(style).not.toContain('transition');
    },
  },
  {
    // Single-photo mode (config.file set): no fetch. kenBurns animates the <img>
    // (kb-a keyframe) and showClock overlays the time.
    type: 'fullscreen-photo', name: 'single-photo-clock-kenburns', kind: 'network-free',
    config: { file: TINY_GIF, showClock: true, kenBurns: true },
    expect: async (mod) => {
      await child('img[style*="kb-a"]')(mod);
      await matches(/\d{1,2}:\d{2}/)(mod);
    },
  },
  {
    // No-photo-selected state (single-photo mode, empty file) paints the themed
    // background. 'linen' bg #f5f1ea = rgb(245,241,234) (default theme is midnight).
    type: 'fullscreen-photo', name: 'theme-linen', kind: 'network-free',
    config: { file: '', theme: 'linen' },
    expect: async (mod) => {
      const bgs = await mod.locator('div').evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).backgroundColor.replace(/\s/g, '')),
      );
      expect(bgs).toContain('rgb(245,241,234)');
    },
  },
  {
    // The theme also has to reach the *loaded* frame, which is what users
    // actually look at: the letterbox ground an `objectFit: contain` photo
    // leaves behind takes the theme bg (linen #f5f1ea), and the clock overlay
    // takes the theme's own text color (linen text #1c1917) rather than the
    // white it used to hardcode.
    type: 'fullscreen-photo', name: 'theme-linen-loaded', kind: 'network-free',
    config: { file: TINY_GIF, theme: 'linen', objectFit: 'contain', showClock: true },
    expect: async (mod) => {
      const bgs = await mod.locator('div').evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).backgroundColor.replace(/\s/g, '')),
      );
      expect(bgs).toContain('rgb(245,241,234)');
      const clock = mod.locator('span').filter({ hasText: /^\d{1,2}:\d{2}$/ }).first();
      await expect(clock).toHaveCSS('color', 'rgb(28, 25, 23)');
    },
  },
  {
    // source 'immich' routes the fetch to /api/immich/photos (the 'immich' stub
    // serves the same bare URL array as backgrounds), and the image renders
    // from that payload.
    type: 'photo-slideshow', name: 'source-immich', kind: 'networked', stubKey: 'immich',
    config: { source: 'immich' },
    expect: async (mod) => {
      await expect(mod.locator('img').first()).toHaveAttribute('src', /^data:image\/gif/);
    },
  },
  {
    // Same immich routing for the fullscreen viewer.
    type: 'fullscreen-photo', name: 'source-immich', kind: 'networked', stubKey: 'immich',
    config: { source: 'immich' },
    expect: async (mod) => {
      await expect(mod.locator('img').first()).toHaveAttribute('src', /^data:image\/gif/);
    },
  },
  {
    // source 'icloud' + a pasted share link route the fetch to
    // /api/icloud/photos (legacy bare-array shape), and the image renders
    // from that payload.
    type: 'photo-slideshow', name: 'source-icloud', kind: 'networked', stubKey: 'icloud',
    config: { source: 'icloud', icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B125e2eFixture' },
    expect: async (mod) => {
      await expect(mod.locator('img').first()).toHaveAttribute('src', /^data:image\/gif/);
    },
  },
  {
    // Same icloud routing for the fullscreen viewer.
    type: 'fullscreen-photo', name: 'source-icloud', kind: 'networked', stubKey: 'icloud',
    config: { source: 'icloud', icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B125e2eFixture' },
    expect: async (mod) => {
      await expect(mod.locator('img').first()).toHaveAttribute('src', /^data:image\/gif/);
    },
  },
  {
    // source 'onedrive' routes the fetch to /api/onedrive/photos (typed
    // shape served by the 'onedrive' stub). The payload-tail selector is
    // routing-sensitive: the backgrounds fixture's gif ends ICTAEAOw, so a
    // fall-through to the local source would not match.
    type: 'photo-slideshow', name: 'source-onedrive', kind: 'networked', stubKey: 'onedrive',
    config: { source: 'onedrive', onedriveFolderId: 'FldE2E1' },
    expect: async (mod) => {
      await expect(mod.locator('img[src$="RAA7"]').first()).toBeAttached();
    },
  },
  {
    // Same onedrive routing for the fullscreen viewer.
    type: 'fullscreen-photo', name: 'source-onedrive', kind: 'networked', stubKey: 'onedrive',
    config: { source: 'onedrive', onedriveFolderId: 'FldE2E1' },
    expect: async (mod) => {
      await expect(mod.locator('img[src$="RAA7"]').first()).toBeAttached();
    },
  },

  // ================= video =================
  // The stub serves the media list; the <video> element's own media fetch 404s
  // under the stub, so assertions are attribute/property-level (matching the
  // hasImgSrc rationale for images).
  {
    // source 'url' bypasses the media-list fetch and renders the URL verbatim
    // (same-origin path so the element's media request never leaves the app).
    type: 'video', name: 'url-source', kind: 'network-free',
    config: { source: 'url', url: '/e2e-direct.mp4' },
    expect: child('video[src="/e2e-direct.mp4"]'),
  },
  {
    // A YouTube URL flips the render path from <video> to the iframe embed
    // player. allowsExternal: the iframe's (blocked) load targets YouTube.
    type: 'video', name: 'youtube-url', kind: 'network-free', allowsExternal: true,
    config: { source: 'url', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    expect: async (mod) => {
      await child('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]')(mod);
      await count('video', 0)(mod);
    },
  },
  {
    type: 'video', name: 'object-fit-contain', kind: 'networked', stubKey: 'backgrounds-videos',
    config: { source: 'file', file: 'e2e-clip.mp4', objectFit: 'contain' },
    expect: async (mod) => { await expect(mod.locator('video').first()).toHaveCSS('object-fit', 'contain'); },
  },
  {
    // muted:false clears the DOM muted property (VideoLayer syncs it imperatively).
    type: 'video', name: 'sound-on', kind: 'networked', stubKey: 'backgrounds-videos',
    config: { source: 'file', file: 'e2e-clip.mp4', muted: false },
    expect: async (mod) => { await expect(mod.locator('video').first()).toHaveJSProperty('muted', false); },
  },
  {
    // loop:false drops the loop attribute (default true sets it).
    type: 'video', name: 'loop-off', kind: 'networked', stubKey: 'backgrounds-videos',
    config: { source: 'file', file: 'e2e-clip.mp4', loop: false },
    expect: child('video:not([loop])'),
  },

  // ================= mixed-media slideshows =================
  // A single-video list keeps the <video> layer stably attached: the sandbox
  // can't serve real decodable bytes, so a multi-item list would error the
  // clip and force-advance to the next slide (detaching the src) before the
  // assertion can observe it. With one item, advance() is a no-op and the
  // layer loops in place — proving mediaTypes flipped the pipeline to
  // rendering a <video> slide instead of an <img>.
  {
    type: 'photo-slideshow', name: 'media-videos-video-slide', kind: 'networked', stubKey: 'backgrounds',
    stubBody: [{ url: '/api/backgrounds/serve?file=e2e-clip.mp4&mt=e2e-token', type: 'video' }],
    config: { mediaTypes: 'videos' },
    expect: child('video[src*="e2e-clip.mp4"]'),
  },
  {
    // Same pipeline flip for the fullscreen viewer.
    type: 'fullscreen-photo', name: 'media-videos-video-slide', kind: 'networked', stubKey: 'backgrounds',
    stubBody: [{ url: '/api/backgrounds/serve?file=e2e-clip.mp4&mt=e2e-token', type: 'video' }],
    config: { mediaTypes: 'videos' },
    expect: child('video[src*="e2e-clip.mp4"]'),
  },
];

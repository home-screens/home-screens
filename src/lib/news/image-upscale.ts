/**
 * Publisher CDNs that resize by URL.
 *
 * Feeds routinely advertise a picture far too small for a full-screen hero
 * even though the same CDN will happily serve a large copy: every BBC feed
 * ships 240x135, which is a 4.5x upscale on a 1080-wide display. Each rule
 * here rewrites only the size token, and picks from the publisher's own size
 * ladder rather than inventing dimensions for them.
 *
 * A rule going stale is harmless: `NewsItem.imageUrlOriginal` keeps whatever
 * the feed actually said and the display falls back to it when a rewritten
 * URL fails to load (see `useStoryImage`).
 */

/**
 * The width a full-screen hero wants. Above the 1080px of a portrait display,
 * and the bar both the feed-image chooser (`parse-feed.ts`) and these rewrite
 * rules aim to clear.
 */
export const TARGET_IMAGE_WIDTH = 1200;

/** The smallest rung that clears the target, or the largest rung there is. */
function rungFor(ladder: readonly number[]): number {
  return ladder.find((w) => w >= TARGET_IMAGE_WIDTH) ?? ladder[ladder.length - 1];
}

/**
 * The widths BBC's own article pages request from ichef, in order. Asking for
 * a size they already render means we land on a warm cache rather than making
 * them resize something new.
 */
const BBC_LADDER = [240, 320, 400, 480, 624, 800, 976, 1248, 1600, 3840] as const;

/**
 * BBC's image CDN takes the width as a path segment and re-renders on demand.
 * Three shapes appear across their feeds: `/ace/standard/<w>/`, `/ace/ws/<w>/`
 * (the World Service variant) and `/images/ic/<w>x<h>/`.
 */
function upscaleBbc(url: string): string | null {
  const target = rungFor(BBC_LADDER);

  const ace = url.replace(
    /(\/ace\/[a-z]+\/)(\d{2,4})\//,
    (match, prefix: string, width: string) =>
      Number(width) < target ? `${prefix}${target}/` : match,
  );
  if (ace !== url) return ace;

  return url.replace(
    /(\/images\/ic\/)(\d{2,4})x(\d{2,4})\//,
    (match, prefix: string, w: string, h: string) => {
      if (Number(w) >= target) return match;
      const height = Math.round((Number(h) * target) / Number(w));
      return `${prefix}${target}x${height}/`;
    },
  );
}

interface UpscaleRule {
  /** Matched against the URL's hostname. */
  host: RegExp;
  upscale: (url: string) => string | null;
}

const RULES: UpscaleRule[] = [
  { host: /(^|\.)bbci\.co\.uk$/i, upscale: upscaleBbc },
];

/**
 * A larger version of `url` from the same CDN, or null when no rule applies,
 * the URL already asks for a big enough image, or the URL is unparseable.
 */
export function upscaleImageUrl(url: string | null): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const rule of RULES) {
    if (!rule.host.test(host)) continue;
    const next = rule.upscale(url);
    if (next && next !== url) return next;
  }
  return null;
}

'use client';

import { useAuthImageState } from '@/components/display/useAuthImage';

/**
 * A team's logo, through the hub's picture proxy.
 *
 * The bytes are asked for with the wall's own fetch and drawn from a blob
 * address, not handed to `<img>` as a hub address: a picture tag cannot carry
 * the display token, so on a hub with a password every logo was turned away.
 * The same logo shown many times on a screen is one download, shared.
 *
 * While the logo loads, and when it cannot be had, its space is held empty so
 * the names and scores beside it never shift. A loading logo never shows the
 * one that was there before: a ticker that moves to the next game would
 * otherwise wear the last game's badge for a moment.
 */
export function TeamLogo({ src, alt, size = 24 }: { src: string; alt: string; size?: number }) {
  const picture = useAuthImageState(src ? `/api/image-proxy?url=${encodeURIComponent(src)}` : undefined, { holdPrevious: false });
  if (!picture.url) return <div style={{ width: size, height: size }} className="shrink-0" />;
  return (
    <img
      src={picture.url}
      alt={alt}
      width={size}
      height={size}
      className="object-contain shrink-0"
      style={{ width: size, height: size }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.opacity = '0';
      }}
    />
  );
}

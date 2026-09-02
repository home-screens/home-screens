'use client';

import type { CSSProperties } from 'react';
import { buildIconClass } from '@/lib/font-awesome-icons';
import { parseIconValue } from '@/lib/icon-value';

interface GlyphProps {
  /** A stored icon value: an emoji/short text, or a `fa:<style>:<name>` token. */
  value: string | null | undefined;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders whichever kind of icon a config field happens to hold.
 *
 * Emoji render as the text node they always were. A Font Awesome pick renders
 * as an `<i>` carrying the icon font's class, which inherits font-size and
 * color from whatever row it sits in — so a rule icon takes the rule's colour
 * and a badge glyph scales with the cell, exactly as the emoji did.
 *
 * Callers already wrap this in their own sized/aria-hidden span where they
 * need one, so this stays an inline fragment and adds no layout of its own.
 */
export default function Glyph({ value, className, style }: GlyphProps) {
  const parsed = parseIconValue(value);
  if (!parsed) return null;
  if (parsed.type === 'text') {
    return className || style ? <span className={className} style={style}>{parsed.text}</span> : <>{parsed.text}</>;
  }
  return (
    <i
      className={`${buildIconClass(parsed.name, parsed.kind)}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
    />
  );
}

/**
 * A glyph followed by a space, for the views that inline the icon into a text
 * run (`{glyph} {title}`). Renders nothing at all when there's no icon, so the
 * title never picks up a stray leading space.
 */
export function GlyphPrefix({ value, className, style }: GlyphProps) {
  if (!parseIconValue(value)) return null;
  return (
    <>
      <Glyph value={value} className={className} style={style} />
      {' '}
    </>
  );
}

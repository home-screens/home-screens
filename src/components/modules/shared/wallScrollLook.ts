import type { CSSProperties } from 'react';
import { ink } from '@/lib/constants';
import { onAccentFor } from '@/lib/fullscreen-themes';

/** What a module hands its `WallScroller`: the button and the bar in the module's own look. */
export interface WallScrollLook {
  backStyle: CSSProperties;
  thumbColor: string;
  thumbWidth: number;
}

/**
 * The "Back to today" button and the scroll bar on a small module: the
 * button in the module's accent with the ink that reads on it (white on a
 * saturated accent, dark on a light one), a little smaller than the module's
 * text (it sits over the list it belongs to), the bar in the module's ink.
 */
export function smallWallScrollLook(accent: string): WallScrollLook {
  return {
    backStyle: {
      background: accent,
      color: onAccentFor(accent),
      fontSize: '0.8em',
      boxShadow: `0 0.3em 1em color-mix(in srgb, ${accent} 40%, transparent)`,
    },
    thumbColor: ink(0.3),
    thumbWidth: 5,
  };
}

/**
 * The same pair on a full-screen module, in its theme: the accent with the
 * theme's own on-accent ink, and a bar in the theme's text colour. The module
 * names its theme's colours and says how big the button and the bar are.
 */
export function themedWallScrollLook({ accent, onAccent, text, top, fontSize, thumbWidth, fontFamily }: {
  /** CSS colours, usually the theme's custom properties. */
  accent: string;
  onAccent: string;
  text: string;
  /** How far under the top of the list the button sits, in px. */
  top: number;
  fontSize: number;
  thumbWidth: number;
  fontFamily?: string;
}): WallScrollLook {
  return {
    backStyle: {
      top,
      fontSize,
      padding: '0.55em 1.2em',
      gap: '0.45em',
      background: accent,
      color: onAccent,
      boxShadow: `0 0.3em 0.9em color-mix(in srgb, ${accent} 35%, transparent)`,
      ...(fontFamily ? { fontFamily } : {}),
    },
    thumbColor: `color-mix(in srgb, ${text} 28%, transparent)`,
    thumbWidth: Math.max(4, Math.round(thumbWidth)),
  };
}

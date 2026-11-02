import type { CSSProperties } from 'react';
import { ink } from '@/lib/constants';

/** What a small module hands its `WallScroller`: the button and the bar in the module's own look. */
export interface WallScrollLook {
  backStyle: CSSProperties;
  thumbColor: string;
  thumbWidth: number;
}

/**
 * The "Back to today" button and the scroll bar on a small module: the
 * button in the module's accent, a little smaller than the module's text
 * (it sits over the list it belongs to), the bar in the module's ink.
 */
export function smallWallScrollLook(accent: string): WallScrollLook {
  return {
    backStyle: {
      background: accent,
      color: '#fff',
      fontSize: '0.8em',
      boxShadow: `0 0.3em 1em color-mix(in srgb, ${accent} 40%, transparent)`,
    },
    thumbColor: ink(0.3),
    thumbWidth: 5,
  };
}

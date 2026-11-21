import type { CSSProperties } from 'react';

/**
 * Text held to a number of lines, losing its tail with an ellipsis if it is
 * longer (-webkit-line-clamp, which the kiosk's Chromium and Firefox both draw).
 */
export function clampLines(lines: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitLineClamp: Math.max(1, Math.round(lines)),
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

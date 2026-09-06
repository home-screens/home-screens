import type { ClockConfig } from '@/types/config';
import type { RefCallback } from 'react';

export interface ClockViewProps {
  config: ClockConfig;
  now: Date;
  scaledFontSize: number;
  /**
   * `scaledFontSize` before Text size. The one-line views fit this to the
   * box width (see fit-width.ts, `fitBaseSize`), so a Text size above 100%
   * is free to overflow instead of being cancelled by the fit.
   */
  autoFontSize: number;
  /**
   * False on a `sizeMode: 'fixed'` clock: `scaledFontSize` is then Text size
   * alone, and no view may shrink it to the box width or stack off the box
   * height. The box only places the clock.
   */
  fitToBox: boolean;
  /**
   * Goes on the view's root element. A callback ref, so swapping the view
   * re-points the module's measurements at the new root on its own.
   */
  containerRef: RefCallback<HTMLDivElement>;
  /**
   * Size of the container in layout px, 0 until measured. One-line views shrink
   * their time string to fit the width (see fit-width.ts) and the vertical view
   * stacks its digits down the height; the rest ignore both.
   */
  boxWidth: number;
  boxHeight: number;
  timezone?: string;
}

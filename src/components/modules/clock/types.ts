import type { ClockConfig } from '@/types/config';
import type { RefCallback } from 'react';

export interface ClockViewProps {
  config: ClockConfig;
  now: Date;
  scaledFontSize: number;
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

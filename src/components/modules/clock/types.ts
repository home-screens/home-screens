import type { ClockConfig } from '@/types/config';
import type { RefObject } from 'react';

export interface ClockViewProps {
  config: ClockConfig;
  now: Date;
  scaledFontSize: number;
  containerRef: RefObject<HTMLDivElement | null>;
  /**
   * Width of the container in layout px, 0 until measured. One-line views
   * shrink their time string to fit it (see fit-width.ts); the rest ignore it.
   */
  boxWidth: number;
  timezone?: string;
}

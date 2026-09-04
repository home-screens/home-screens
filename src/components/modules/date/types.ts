import type { RefCallback } from 'react';
import type { DateConfig } from '@/types/config';

export interface DateViewProps {
  config: DateConfig;
  now: Date;
  scaledFontSize: number;
  containerRef: RefCallback<HTMLDivElement>;
}

'use client';

import type { DateConfig, DateView, ModuleStyle } from '@/types/config';
import { useTZClock } from '@/hooks/useTZClock';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import ModuleWrapper from '../ModuleWrapper';
import DateFullView from './DateFullView';
import DateMinimalView from './DateMinimalView';
import DateStackedView from './DateStackedView';
import DateEditorialView from './DateEditorialView';
import DateBannerView from './DateBannerView';

const VIEW_COMPONENTS: Record<DateView, typeof DateFullView> = {
  full: DateFullView,
  minimal: DateMinimalView,
  stacked: DateStackedView,
  editorial: DateEditorialView,
  banner: DateBannerView,
};

const SCALE_FACTORS: Record<DateView, number> = {
  full: 0.08,
  minimal: 0.10,
  stacked: 0.08,
  editorial: 0.08,
  banner: 0.10,
};

interface DateModuleProps {
  config: DateConfig;
  style: ModuleStyle;
  /** Effective zone — buildModuleProps merges the per-module override with the display setting. */
  timezone?: string;
}

export default function DateModule({ config, style, timezone }: DateModuleProps) {
  const view = config.view ?? 'full';
  // Date only changes once per day, but update every minute for midnight rollover
  const now = useTZClock(timezone, 60_000);
  const scaleFactor = SCALE_FACTORS[view] ?? 0.08;
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, scaleFactor);

  const ViewComponent = VIEW_COMPONENTS[view] ?? DateFullView;

  return (
    <ModuleWrapper style={style}>
      <ViewComponent
        config={config}
        now={now}
        scaledFontSize={scaledFontSize}
        containerRef={containerRef}
      />
    </ModuleWrapper>
  );
}

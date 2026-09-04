'use client';

import type { ClockConfig, ClockView, ModuleStyle } from '@/types/config';
import { useTZClock } from '@/hooks/useTZClock';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import ModuleWrapper from '../ModuleWrapper';
import ClockClassicView from './ClockClassicView';
import ClockDigitalView from './ClockDigitalView';
import ClockAnalogView from './ClockAnalogView';
import ClockMinimalView from './ClockMinimalView';
import ClockFlipView from './ClockFlipView';
import ClockWordView from './ClockWordView';
import ClockBinaryView from './ClockBinaryView';
import ClockVerticalView from './ClockVerticalView';
import ClockSplitView from './ClockSplitView';
import ClockProgressView from './ClockProgressView';
import ClockFuzzyView from './ClockFuzzyView';
import ClockWorldView from './ClockWorldView';
import ClockDotMatrixView from './ClockDotMatrixView';
import ClockRadialView from './ClockRadialView';
import ClockArcView from './ClockArcView';
import ClockNeonView from './ClockNeonView';
import ClockBarView from './ClockBarView';
import ClockElapsedView from './ClockElapsedView';

const VIEW_COMPONENTS: Record<ClockView, typeof ClockClassicView> = {
  classic: ClockClassicView,
  digital: ClockDigitalView,
  analog: ClockAnalogView,
  minimal: ClockMinimalView,
  flip: ClockFlipView,
  word: ClockWordView,
  binary: ClockBinaryView,
  vertical: ClockVerticalView,
  split: ClockSplitView,
  progress: ClockProgressView,
  fuzzy: ClockFuzzyView,
  world: ClockWorldView,
  'dot-matrix': ClockDotMatrixView,
  radial: ClockRadialView,
  arc: ClockArcView,
  neon: ClockNeonView,
  bar: ClockBarView,
  elapsed: ClockElapsedView,
};

const SCALE_FACTORS: Record<ClockView, number> = {
  classic: 0.12,
  digital: 0.10,
  analog: 0.10,
  minimal: 0.10,
  flip: 0.10,
  word: 0.10,
  binary: 0.08,
  vertical: 0.06,
  split: 0.10,
  progress: 0.06,
  fuzzy: 0.10,
  world: 0.08,
  'dot-matrix': 0.04,
  radial: 0.06,
  arc: 0.06,
  neon: 0.10,
  bar: 0.08,
  elapsed: 0.10,
};

/** Views that never need second-level precision */
const MINUTE_ONLY_VIEWS = new Set<ClockView>(['word', 'fuzzy', 'minimal']);

function getTickInterval(view: ClockView, showSeconds: boolean): number {
  if (MINUTE_ONLY_VIEWS.has(view)) return 60_000;
  return showSeconds ? 1000 : 60_000;
}

interface ClockModuleProps {
  config: ClockConfig;
  style: ModuleStyle;
  /** Effective zone — buildModuleProps merges the per-module override with the display setting. */
  timezone?: string;
}

export default function ClockModule({ config, style, timezone }: ClockModuleProps) {
  const view = config.view ?? 'classic';
  // The elapsed view ticks its own real clock (useRealClock in the view), so
  // the module-level shifted clock only needs a coarse keepalive there.
  const interval = view === 'elapsed' ? 600_000 : getTickInterval(view, config.showSeconds ?? true);
  const now = useTZClock(timezone, interval);
  const scaleFactor = SCALE_FACTORS[view] ?? 0.10;
  // One ref on the view's root feeds both the font scale and the box the
  // width-fitting views lay out against; it follows the node when the view is
  // swapped.
  const { containerRef, scaledFontSize, boxWidth, boxHeight } = useScaledFontSize(style.fontSize, scaleFactor);

  const ViewComponent = VIEW_COMPONENTS[view] ?? ClockClassicView;

  return (
    <ModuleWrapper style={style}>
      <ViewComponent
        config={config}
        now={now}
        scaledFontSize={scaledFontSize}
        containerRef={containerRef}
        boxWidth={boxWidth}
        boxHeight={boxHeight}
        timezone={timezone}
      />
    </ModuleWrapper>
  );
}

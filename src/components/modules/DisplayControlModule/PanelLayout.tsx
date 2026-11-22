'use client';

import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { useControlFrame } from './useControlFrame';
import { BrightnessSlider, ControlButton, ControlGrid, PageAndPowerButtons } from './controls';
import { rowButtonMetrics } from './metrics';

/**
 * Four word-and-icon buttons in a grid with the brightness slider under them.
 * With `onTimers`, a full-width Timers button sits between the grid and the
 * slider, the way the pad lays out its Brightness row.
 */
export function PanelLayout(props: LayoutProps) {
  const t = useTranslate('modules');
  const { brightness, onPrev, onNext, onSleep, onWake, onBrightness, onTimers } = props;
  const { boxRef, m, picker, dim } = useControlFrame(props, 'panel');

  return (
    <div
      ref={boxRef}
      className="h-full w-full flex flex-col"
      style={{ padding: m.pad, gap: m.gap }}
      data-layout="panel"
    >
      {picker}

      <ControlGrid m={m} className={`transition-opacity ${dim}`}>
        <PageAndPowerButtons m={m} onPrev={onPrev} onNext={onNext} onSleep={onSleep} onWake={onWake} />
      </ControlGrid>

      {onTimers && (
        <ControlButton
          m={rowButtonMetrics(m)}
          row
          label={t('display-control.timers')}
          icon="timer"
          opensDialog
          onClick={onTimers}
          className={`shrink-0 transition-opacity ${dim}`}
          style={{ height: m.rowH }}
        />
      )}

      {/* Held at the height the sizing model reserved, so the buttons above
          really do get the box the metrics were computed from. */}
      <div className={`shrink-0 transition-opacity ${dim}`} style={{ height: m.sliderH }}>
        <BrightnessSlider value={brightness} onCommit={onBrightness} m={m} className="h-full" />
      </div>
    </div>
  );
}

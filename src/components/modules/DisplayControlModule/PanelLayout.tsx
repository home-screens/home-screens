'use client';

import type { LayoutProps } from './types';
import { useControlFrame } from './useControlFrame';
import { BrightnessSlider, ControlGrid, PageAndPowerButtons } from './controls';

/** Four word-and-icon buttons in a grid with the brightness slider under them. */
export function PanelLayout(props: LayoutProps) {
  const { brightness, onPrev, onNext, onSleep, onWake, onBrightness } = props;
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

      {/* Held at the height the sizing model reserved, so the buttons above
          really do get the box the metrics were computed from. */}
      <div className={`shrink-0 transition-opacity ${dim}`} style={{ height: m.sliderH }}>
        <BrightnessSlider value={brightness} onCommit={onBrightness} m={m} className="h-full" />
      </div>
    </div>
  );
}

'use client';

import { wallPress } from '@/components/modules/shared/wallPress';
import { useState } from 'react';
import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { useControlFrame } from './useControlFrame';
import { BrightnessSlider, ControlButton, ControlGrid, PageAndPowerButtons } from './controls';
import { rowButtonMetrics } from './metrics';
import { NO_VALUE } from '@/lib/constants';

/**
 * Buttons only: a grid plus a Brightness row that swaps the grid for a
 * slider while open. Same words as the panel, no always-visible slider.
 */
export function PadLayout(props: LayoutProps) {
  const t = useTranslate('modules');
  const { brightness, onPrev, onNext, onSleep, onWake, onBrightness } = props;
  const [brightnessOpen, setBrightnessOpen] = useState(false);
  const { boxRef, m, picker, dim } = useControlFrame(props, 'pad');

  return (
    <div
      ref={boxRef}
      className="h-full w-full flex flex-col"
      style={{ padding: m.pad, gap: m.gap }}
      data-layout="pad"
    >
      {picker}

      {brightnessOpen ? (
        <div
          className={`flex-1 min-h-0 bg-hs-card border border-hs-border-strong flex flex-col ${dim}`}
          style={{ borderRadius: m.radius, padding: m.pad, gap: m.gap }}
        >
          <div className="flex justify-end">
            <button
              type="button"
              aria-label={t('display-control.closeBrightness')}
              onClick={() => setBrightnessOpen(false)}
              {...wallPress('flex shrink-0 items-center justify-center rounded-full text-hs-text-muted')}
              style={{ height: m.icon + m.gap, width: m.icon + m.gap }}
            >
              <svg style={{ height: m.icon * 0.7, width: m.icon * 0.7 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6l-12 12" />
              </svg>
            </button>
          </div>
          <BrightnessSlider value={brightness} onCommit={onBrightness} m={m} className="my-auto" />
        </div>
      ) : (
        <div className={`flex-1 min-h-0 flex flex-col transition-opacity ${dim}`} style={{ gap: m.gap }}>
          <ControlGrid m={m}>
            <PageAndPowerButtons m={m} onPrev={onPrev} onNext={onNext} onSleep={onSleep} onWake={onWake} />
          </ControlGrid>
          <ControlButton
            m={rowButtonMetrics(m)}
            row
            label={t('display-control.brightness')}
            sub={brightness === null ? NO_VALUE : `${brightness}%`}
            icon="brightness"
            onClick={() => setBrightnessOpen(true)}
            className="shrink-0"
            style={{ height: m.rowH }}
          />
        </div>
      )}
    </div>
  );
}

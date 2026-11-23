'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { BrightnessPopover } from './BrightnessPopover';
import { useControlFrame } from './useControlFrame';
import { ControlButton, SleepButton } from './controls';
import { NO_VALUE } from '@/lib/constants';

/** One row of word-and-icon buttons; Brightness opens a popover above the row. */
export function BarLayout(props: LayoutProps) {
  const t = useTranslate('modules');
  const { brightness, onPrev, onNext, onSleep, onWake, onBrightness } = props;
  const [brightnessOpen, setBrightnessOpen] = useState(false);
  // The picker's list opens beside the row, not over it, so nothing fades.
  const { boxRef, m, showPicker, picker } = useControlFrame(props, 'bar', { fadeWhilePicking: false });

  return (
    <div
      ref={boxRef}
      className="h-full w-full flex items-stretch"
      style={{ paddingInline: m.pad, paddingBlock: m.pad * 0.75, gap: m.gap }}
      data-layout="bar"
    >
      {showPicker && <div className="flex items-center">{picker}</div>}
      {showPicker && <div className="w-px self-center bg-hs-border-strong" style={{ height: '60%' }} />}

      <ControlButton m={m} row className="flex-1" label={t('display-control.prev')} ariaLabel={t('display-control.ariaPrev')} icon="prev" onClick={onPrev} />
      <ControlButton m={m} row className="flex-1" label={t('display-control.next')} ariaLabel={t('display-control.ariaNext')} icon="next" onClick={onNext} />

      <SleepButton m={m} row className="flex-1" onConfirm={onSleep} />

      <ControlButton m={m} row className="flex-1" label={t('display-control.wake')} icon="wake" onClick={onWake} />

      <div className="relative flex flex-1">
        <ControlButton
          m={m}
          row
          className="flex-1"
          label={t('display-control.brightness')}
          sub={brightness === null ? NO_VALUE : `${brightness}%`}
          icon="brightness"
          onClick={() => setBrightnessOpen((v) => !v)}
        />
        {brightnessOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20">
            <BrightnessPopover
              initial={brightness}
              onCommit={(v) => {
                onBrightness(v);
                setBrightnessOpen(false);
              }}
              onDismiss={() => setBrightnessOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

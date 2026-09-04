'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { HoldConfirmButton } from './HoldConfirmButton';
import { controlMetrics } from './metrics';
import { useElementBox } from '@/hooks/useElementBox';
import { BUTTON_CLASS, BrightnessSlider, ButtonWords, ControlButton, ControlIcon, buttonStyle } from './controls';

/**
 * Buttons only: a grid plus a Brightness row that swaps the grid for a
 * slider while open. Same words as the panel, no always-visible slider.
 */
export function PadLayout(props: LayoutProps) {
  const t = useTranslate('modules');
  const {
    allowRetargeting, compact, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, selfId,
    brightness, onPrev, onNext, onSleep, onWake, onBrightness,
  } = props;
  const [brightnessOpen, setBrightnessOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const showPicker = allowRetargeting && !isLegacyMode;
  const dim = pickerOpen ? 'opacity-35' : '';
  const [boxRef, box] = useElementBox('padding');
  const m = controlMetrics({ w: box.width, h: box.height, layout: 'pad', compact, showPicker });

  return (
    <div
      ref={boxRef}
      className="h-full w-full flex flex-col"
      style={{ padding: m.pad, gap: m.gap }}
      data-layout="pad"
    >
      {showPicker && (
        <TargetPicker
          value={currentTarget}
          onChange={(v) => setCurrentTarget(v)}
          options={availableDisplays}
          selfId={selfId}
          onOpenChange={setPickerOpen}
          m={m}
        />
      )}

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
              className="flex shrink-0 items-center justify-center rounded-full text-hs-text-muted transition-transform active:scale-95"
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
          <div
            className="grid flex-1 min-h-0"
            style={{
              gridTemplateColumns: `repeat(${m.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${m.rows}, minmax(0, 1fr))`,
              gap: m.gap,
            }}
          >
            <ControlButton m={m} label={t('display-control.prev')} ariaLabel={t('display-control.ariaPrev')} icon="prev" onClick={onPrev} />
            <ControlButton m={m} label={t('display-control.next')} ariaLabel={t('display-control.ariaNext')} icon="next" onClick={onNext} />
            <HoldConfirmButton
              ariaLabel={t('display-control.sleepHoldHint')}
              hint={t('display-control.keepHolding')}
              hintFontSize={Math.max(11, m.label || 13)}
              onConfirm={onSleep}
              className={BUTTON_CLASS}
              style={buttonStyle(m)}
              contentClassName="flex h-full w-full flex-col items-center justify-center"
            >
              <ControlIcon name="sleep" m={m} />
              <ButtonWords m={m} label={t('display-control.sleep')} sub={t('display-control.holdSub')} />
            </HoldConfirmButton>
            <ControlButton m={m} label={t('display-control.wake')} sub={t('display-control.wakeSub')} icon="wake" onClick={onWake} />
          </div>
          <ControlButton
            m={m}
            row
            label={t('display-control.brightness')}
            sub={brightness === null ? '–' : `${brightness}%`}
            icon="brightness"
            onClick={() => setBrightnessOpen(true)}
            className="shrink-0"
            style={{ height: m.brightRowH }}
          />
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { HoldConfirmButton } from './HoldConfirmButton';
import { BUTTON_CLASS, BrightnessIcon, BrightnessSlider, ButtonWords, ControlButton, NextIcon, PrevIcon, SleepIcon, WakeIcon } from './controls';

/**
 * Buttons only: a 2x2 grid plus a Brightness row that swaps the grid for a
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

  return (
    <div className="h-full w-full flex flex-col p-4 gap-3" data-layout="pad">
      {showPicker && (
        <TargetPicker
          value={currentTarget}
          onChange={(v) => setCurrentTarget(v)}
          options={availableDisplays}
          selfId={selfId}
          onOpenChange={setPickerOpen}
        />
      )}

      {brightnessOpen ? (
        <div className={`flex-1 min-h-0 rounded-[18px] bg-hs-card border border-hs-border-strong flex flex-col p-4 gap-3 ${dim}`}>
          <div className="flex justify-end">
            <button
              type="button"
              aria-label={t('display-control.closeBrightness')}
              onClick={() => setBrightnessOpen(false)}
              className="h-12 w-12 rounded-full flex items-center justify-center text-hs-text-muted transition-transform active:scale-95"
            >
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6l-12 12" />
              </svg>
            </button>
          </div>
          <BrightnessSlider value={brightness} onCommit={onBrightness} className="my-auto" />
        </div>
      ) : (
        <div className={`flex-1 min-h-0 flex flex-col gap-3 transition-opacity ${dim}`}>
          <div className="grid grid-cols-2 grid-rows-2 gap-3 flex-1 min-h-0">
            <ControlButton compact={compact} label={t('display-control.ariaPrev')} icon={<PrevIcon />} onClick={onPrev} />
            <ControlButton compact={compact} label={t('display-control.ariaNext')} icon={<NextIcon />} onClick={onNext} />
            <HoldConfirmButton
              ariaLabel={t('display-control.sleepHoldHint')}
              hint={t('display-control.keepHolding')}
              onConfirm={onSleep}
              className={BUTTON_CLASS}
              contentClassName="flex h-full w-full flex-col items-center justify-center gap-2"
            >
              <SleepIcon />
              {!compact && <ButtonWords label={t('display-control.sleep')} sub={t('display-control.holdSub')} />}
            </HoldConfirmButton>
            <ControlButton compact={compact} label={t('display-control.wake')} sub={t('display-control.wakeSub')} icon={<WakeIcon />} onClick={onWake} />
          </div>
          <ControlButton
            compact={compact}
            row
            label={t('display-control.brightness')}
            sub={brightness === null ? '–' : `${brightness}%`}
            icon={<BrightnessIcon size={28} />}
            onClick={() => setBrightnessOpen(true)}
            className="min-h-[72px] shrink-0"
          />
        </div>
      )}
    </div>
  );
}

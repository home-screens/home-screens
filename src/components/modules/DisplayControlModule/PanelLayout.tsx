'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { HoldConfirmButton } from './HoldConfirmButton';
import { BUTTON_CLASS, BrightnessSlider, ButtonWords, ControlButton, NextIcon, PrevIcon, SleepIcon, WakeIcon } from './controls';

/** Four big word-and-icon buttons in a 2x2 grid with the brightness slider under them. */
export function PanelLayout(props: LayoutProps) {
  const t = useTranslate('modules');
  const {
    allowRetargeting, compact, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, selfId,
    brightness, onPrev, onNext, onSleep, onWake, onBrightness,
  } = props;
  const showPicker = allowRetargeting && !isLegacyMode;
  const [pickerOpen, setPickerOpen] = useState(false);
  const dim = pickerOpen ? 'opacity-35' : '';

  return (
    <div className="h-full w-full flex flex-col p-5 gap-4" data-layout="panel">
      {showPicker && (
        <TargetPicker
          value={currentTarget}
          onChange={(v) => setCurrentTarget(v)}
          options={availableDisplays}
          selfId={selfId}
          onOpenChange={setPickerOpen}
        />
      )}

      <div className={`grid grid-cols-2 grid-rows-2 gap-3 flex-1 min-h-0 transition-opacity ${dim}`}>
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

      <BrightnessSlider value={brightness} onCommit={onBrightness} className={`mt-auto transition-opacity ${dim}`} />
    </div>
  );
}

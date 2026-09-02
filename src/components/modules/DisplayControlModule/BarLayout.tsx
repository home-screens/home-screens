'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { HoldConfirmButton } from './HoldConfirmButton';
import { BrightnessPopover } from './BrightnessPopover';
import { BUTTON_CLASS, BrightnessIcon, ButtonWords, ControlButton, NextIcon, PrevIcon, SleepIcon, WakeIcon } from './controls';

const ICON = 28;

/** One row of word-and-icon buttons; Brightness opens a popover above the row. */
export function BarLayout(props: LayoutProps) {
  const t = useTranslate('modules');
  const {
    allowRetargeting, compact, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, selfId,
    brightness, onPrev, onNext, onSleep, onWake, onBrightness,
  } = props;
  const [brightnessOpen, setBrightnessOpen] = useState(false);
  const showPicker = allowRetargeting && !isLegacyMode;

  return (
    <div className="h-full w-full flex items-stretch gap-3 px-4 py-3" data-layout="bar">
      {showPicker && (
        <div className="flex items-center">
          <TargetPicker
            value={currentTarget}
            onChange={(v) => setCurrentTarget(v)}
            options={availableDisplays}
            selfId={selfId}
          />
        </div>
      )}
      {showPicker && <div className="w-px self-center h-10 bg-hs-border-strong" />}

      <ControlButton compact={compact} row className="flex-1" label={t('display-control.prev')} ariaLabel={t('display-control.ariaPrev')} icon={<PrevIcon size={ICON} />} onClick={onPrev} />
      <ControlButton compact={compact} row className="flex-1" label={t('display-control.next')} ariaLabel={t('display-control.ariaNext')} icon={<NextIcon size={ICON} />} onClick={onNext} />

      <HoldConfirmButton
        ariaLabel={t('display-control.sleepHoldHint')}
        hint={t('display-control.keepHolding')}
        onConfirm={onSleep}
        className={`${BUTTON_CLASS} flex-1`}
        contentClassName="flex h-full w-full items-center justify-center gap-3"
      >
        <SleepIcon size={ICON} />
        {!compact && <ButtonWords row label={t('display-control.sleep')} sub={t('display-control.holdShort')} />}
      </HoldConfirmButton>

      <ControlButton compact={compact} row className="flex-1" label={t('display-control.wake')} icon={<WakeIcon size={ICON} />} onClick={onWake} />

      <div className="relative flex flex-1">
        <ControlButton
          compact={compact}
          row
          className="flex-1"
          label={t('display-control.brightness')}
          sub={brightness === null ? '–' : `${brightness}%`}
          icon={<BrightnessIcon size={ICON} />}
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

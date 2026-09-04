'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { HoldConfirmButton } from './HoldConfirmButton';
import { BrightnessPopover } from './BrightnessPopover';
import { controlMetrics } from './metrics';
import { useElementBox } from '@/hooks/useElementBox';
import { BUTTON_CLASS, ButtonWords, ControlButton, ControlIcon, buttonStyle } from './controls';

/** One row of word-and-icon buttons; Brightness opens a popover above the row. */
export function BarLayout(props: LayoutProps) {
  const t = useTranslate('modules');
  const {
    allowRetargeting, compact, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, selfId,
    brightness, onPrev, onNext, onSleep, onWake, onBrightness,
  } = props;
  const [brightnessOpen, setBrightnessOpen] = useState(false);
  const showPicker = allowRetargeting && !isLegacyMode;
  const [boxRef, box] = useElementBox('padding');
  const m = controlMetrics({ w: box.width, h: box.height, layout: 'bar', compact, showPicker });

  return (
    <div
      ref={boxRef}
      className="h-full w-full flex items-stretch"
      style={{ paddingInline: m.pad, paddingBlock: m.pad * 0.75, gap: m.gap }}
      data-layout="bar"
    >
      {showPicker && (
        <div className="flex items-center">
          <TargetPicker
            value={currentTarget}
            onChange={(v) => setCurrentTarget(v)}
            options={availableDisplays}
            selfId={selfId}
            m={m}
          />
        </div>
      )}
      {showPicker && <div className="w-px self-center bg-hs-border-strong" style={{ height: '60%' }} />}

      <ControlButton m={m} row className="flex-1" label={t('display-control.prev')} ariaLabel={t('display-control.ariaPrev')} icon="prev" onClick={onPrev} />
      <ControlButton m={m} row className="flex-1" label={t('display-control.next')} ariaLabel={t('display-control.ariaNext')} icon="next" onClick={onNext} />

      <HoldConfirmButton
        ariaLabel={t('display-control.sleepHoldHint')}
        hint={t('display-control.keepHolding')}
        hintFontSize={Math.max(11, m.label || 13)}
        onConfirm={onSleep}
        className={`${BUTTON_CLASS} flex-1`}
        style={buttonStyle(m)}
        contentClassName="flex h-full w-full items-center justify-center"
      >
        <ControlIcon name="sleep" m={m} />
        <ButtonWords row m={m} label={t('display-control.sleep')} sub={t('display-control.holdShort')} />
      </HoldConfirmButton>

      <ControlButton m={m} row className="flex-1" label={t('display-control.wake')} icon="wake" onClick={onWake} />

      <div className="relative flex flex-1">
        <ControlButton
          m={m}
          row
          className="flex-1"
          label={t('display-control.brightness')}
          sub={brightness === null ? '–' : `${brightness}%`}
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

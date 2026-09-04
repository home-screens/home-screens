'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { HoldConfirmButton } from './HoldConfirmButton';
import { controlMetrics } from './metrics';
import { useElementBox } from '@/hooks/useElementBox';
import { BUTTON_CLASS, BrightnessSlider, ButtonWords, ControlButton, ControlIcon, buttonStyle } from './controls';

/** Four word-and-icon buttons in a grid with the brightness slider under them. */
export function PanelLayout(props: LayoutProps) {
  const t = useTranslate('modules');
  const {
    allowRetargeting, compact, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, selfId,
    brightness, onPrev, onNext, onSleep, onWake, onBrightness,
  } = props;
  const showPicker = allowRetargeting && !isLegacyMode;
  const [pickerOpen, setPickerOpen] = useState(false);
  const dim = pickerOpen ? 'opacity-35' : '';
  const [boxRef, box] = useElementBox('padding');
  const m = controlMetrics({ w: box.width, h: box.height, layout: 'panel', compact, showPicker });

  return (
    <div
      ref={boxRef}
      className="h-full w-full flex flex-col"
      style={{ padding: m.pad, gap: m.gap }}
      data-layout="panel"
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

      <div
        className={`grid flex-1 min-h-0 transition-opacity ${dim}`}
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

      {/* Held at the height the sizing model reserved, so the buttons above
          really do get the box the metrics were computed from. */}
      <div className={`shrink-0 transition-opacity ${dim}`} style={{ height: m.sliderH }}>
        <BrightnessSlider value={brightness} onCommit={onBrightness} m={m} className="h-full" />
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { controlMetrics } from './metrics';
import { useControlBox } from './useControlBox';
import { ControlButton } from './controls';

/**
 * Previous and Next, nothing else: no sleep, no wake, no brightness.
 * The two buttons split the box along its long axis, and a tall box stacks
 * them with up/down chevrons instead of pointing left and right at each other.
 */
export function NavLayout(props: LayoutProps) {
  const t = useTranslate('modules');
  const {
    allowRetargeting, compact, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, selfId,
    onPrev, onNext,
  } = props;
  const showPicker = allowRetargeting && !isLegacyMode;
  const [pickerOpen, setPickerOpen] = useState(false);
  const dim = pickerOpen ? 'opacity-35' : '';
  const [boxRef, box] = useControlBox();
  const m = controlMetrics({ ...box, layout: 'nav', compact, showPicker });
  const stacked = m.rows === 2;

  return (
    <div
      ref={boxRef}
      className="h-full w-full flex flex-col"
      style={{ padding: m.pad, gap: m.gap }}
      data-layout="nav"
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
        <ControlButton
          m={m}
          label={t('display-control.prev')}
          ariaLabel={t('display-control.ariaPrev')}
          icon={stacked ? 'up' : 'prev'}
          onClick={onPrev}
        />
        <ControlButton
          m={m}
          label={t('display-control.next')}
          ariaLabel={t('display-control.ariaNext')}
          icon={stacked ? 'down' : 'next'}
          onClick={onNext}
        />
      </div>
    </div>
  );
}

'use client';

import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { useControlFrame } from './useControlFrame';
import { ControlButton, ControlGrid } from './controls';

/**
 * Previous and Next, nothing else: no sleep, no wake, no brightness.
 * The two buttons split the box along its long axis, and a tall box stacks
 * them with up/down chevrons instead of pointing left and right at each other.
 */
export function NavLayout(props: LayoutProps) {
  const t = useTranslate('modules');
  const { onPrev, onNext } = props;
  const { boxRef, m, picker, dim } = useControlFrame(props, 'nav');
  const stacked = m.rows === 2;

  return (
    <div
      ref={boxRef}
      className="h-full w-full flex flex-col"
      style={{ padding: m.pad, gap: m.gap }}
      data-layout="nav"
    >
      {picker}

      <ControlGrid m={m} className={`transition-opacity ${dim}`}>
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
      </ControlGrid>
    </div>
  );
}

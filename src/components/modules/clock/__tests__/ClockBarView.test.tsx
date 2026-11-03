// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import type { ClockConfig } from '@/types/config';
import { getModuleDefinition } from '@/lib/module-registry';
import ClockBarView from '../ClockBarView';
import type { ClockViewProps } from '../types';

function hourBar(hours: number, format24h: boolean): { label: string; fill: string } {
  const at = new Date(2026, 9, 3, hours, 30, 0);
  const props: ClockViewProps = {
    config: { ...(getModuleDefinition('clock')!.defaultConfig as unknown as ClockConfig), showSeconds: false },
    format24h,
    instant: at,
    now: at,
    time: { hours, minutes: 30, seconds: 0 },
    scaledFontSize: 40,
    autoFontSize: 40,
    fitToBox: true,
    containerRef: () => {},
    boxWidth: 600,
    boxHeight: 300,
  };
  const { container } = render(
    <I18nProvider locale="en-US" blob={{ modules: enUSModules }}><ClockBarView {...props} /></I18nProvider>,
  );
  // The first bar row is the hours: label, track with its fill, value.
  const row = container.querySelector('.w-full.flex.items-center')!;
  const fill = row.querySelector<HTMLElement>('.absolute')!;
  const value = row.querySelectorAll('span')[1];
  return { label: value.textContent ?? '', fill: fill.style.width };
}

afterEach(cleanup);

describe('ClockBarView hour bar', () => {
  it('reads 12 during the noon and midnight hours on a 12-hour clock, with the bar full', () => {
    expect(hourBar(12, false)).toEqual({ label: '12', fill: '100%' });
    expect(hourBar(0, false)).toEqual({ label: '12', fill: '100%' });
  });

  it('counts the other hours from 1 on a 12-hour clock', () => {
    expect(hourBar(13, false)).toEqual({ label: '01', fill: `${(1 / 12) * 100}%` });
    expect(hourBar(11, false)).toEqual({ label: '11', fill: `${(11 / 12) * 100}%` });
  });

  it('keeps 00 to 23 on a 24-hour clock', () => {
    expect(hourBar(0, true)).toEqual({ label: '00', fill: '0%' });
    expect(hourBar(12, true)).toEqual({ label: '12', fill: '50%' });
  });
});

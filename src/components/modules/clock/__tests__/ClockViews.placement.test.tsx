// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import type { ClockConfig } from '@/types/config';
import { getModuleDefinition } from '@/lib/module-registry';
import ClockClassicView from '../ClockClassicView';
import ClockMinimalView from '../ClockMinimalView';
import { clockAlignmentStyle } from '../alignment';
import type { ClockViewProps } from '../types';

/**
 * The placement settings and the Minimal AM/PM suffix, rendered through the
 * real views. Sizing is not measured here (jsdom has no layout); the fit
 * arithmetic has its own tests in fit-width.test.ts.
 */
const NOON_ISH = new Date(2026, 8, 6, 14, 5, 9);

function config(over: Partial<ClockConfig> = {}): ClockConfig {
  return { ...(getModuleDefinition('clock')!.defaultConfig as unknown as ClockConfig), format24h: false, ...over };
}

function viewProps(over: Partial<ClockConfig>, props: Partial<ClockViewProps> = {}): ClockViewProps {
  return {
    config: config(over),
    now: NOON_ISH,
    scaledFontSize: 40,
    autoFontSize: 40,
    fitToBox: true,
    containerRef: () => {},
    boxWidth: 600,
    boxHeight: 300,
    ...props,
  };
}

const ui = (node: React.ReactNode) => (
  <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{node}</I18nProvider>
);

afterEach(cleanup);

describe('clockAlignmentStyle', () => {
  it('centers both ways when nothing is set, matching the roots as they were', () => {
    expect(clockAlignmentStyle({}, 'row')).toEqual({ justifyContent: 'center', alignItems: 'center' });
    expect(clockAlignmentStyle({}, 'column')).toEqual({ justifyContent: 'center', alignItems: 'center' });
  });

  it('puts horizontal alignment on the axis the root flows along', () => {
    expect(clockAlignmentStyle({ alignment: 'left', verticalAlign: 'top' }, 'row'))
      .toEqual({ justifyContent: 'flex-start', alignItems: 'flex-start' });
    expect(clockAlignmentStyle({ alignment: 'right', verticalAlign: 'top' }, 'row'))
      .toEqual({ justifyContent: 'flex-end', alignItems: 'flex-start' });
    expect(clockAlignmentStyle({ alignment: 'right', verticalAlign: 'bottom' }, 'column'))
      .toEqual({ justifyContent: 'flex-end', alignItems: 'flex-end' });
    expect(clockAlignmentStyle({ alignment: 'left', verticalAlign: 'bottom' }, 'column'))
      .toEqual({ justifyContent: 'flex-end', alignItems: 'flex-start' });
  });

  it('ignores a value a hand-edited config might carry', () => {
    expect(clockAlignmentStyle({ alignment: 'middle' as never }, 'row').justifyContent).toBe('center');
  });
});

describe('clock view placement', () => {
  it('Classic pins to the top-left corner through its column root', () => {
    const { container } = render(ui(<ClockClassicView {...viewProps({ alignment: 'left', verticalAlign: 'top', showSeconds: false })} />));
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.justifyContent).toBe('flex-start');
    expect(root.style.alignItems).toBe('flex-start');
    expect(root.className).not.toContain('items-center');
  });

  it('Minimal pins to the bottom-right corner through its row root', () => {
    const { container } = render(ui(<ClockMinimalView {...viewProps({ alignment: 'right', verticalAlign: 'bottom' })} />));
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.justifyContent).toBe('flex-end');
    expect(root.style.alignItems).toBe('flex-end');
  });
});

describe('fixed size', () => {
  const timeFontPx = (container: HTMLElement) =>
    parseFloat((container.querySelector('div.tabular-nums') as HTMLElement).style.fontSize);

  it('Classic shrinks to a narrow box when fitting, and ignores it when fixed', () => {
    const narrow = { boxWidth: 100 };
    const fit = render(ui(<ClockClassicView {...viewProps({ showSeconds: true }, narrow)} />));
    expect(timeFontPx(fit.container)).toBeLessThan(120);
    cleanup();
    const fixed = render(ui(<ClockClassicView {...viewProps({ showSeconds: true }, { ...narrow, fitToBox: false })} />));
    expect(timeFontPx(fixed.container)).toBe(120);
  });

  it('Classic never wraps its date line to the box when fixed', () => {
    const dateLine = (c: HTMLElement) => c.querySelector('div.tabular-nums + div') as HTMLElement;
    const fit = render(ui(<ClockClassicView {...viewProps({ showDate: true })} />));
    expect(dateLine(fit.container).style.whiteSpace).toBe('');
    cleanup();
    const fixed = render(ui(<ClockClassicView {...viewProps({ showDate: true }, { fitToBox: false })} />));
    expect(dateLine(fixed.container).style.whiteSpace).toBe('nowrap');
  });
});

describe('Minimal AM/PM', () => {
  it('is the bare time unless asked for', () => {
    const { container } = render(ui(<ClockMinimalView {...viewProps({})} />));
    expect(container.textContent).toBe('2:05');
  });

  it('appends the suffix in 12-hour mode', () => {
    const { container } = render(ui(<ClockMinimalView {...viewProps({ showAmPm: true })} />));
    expect(container.textContent).toBe('2:05 PM');
  });

  it('has nothing to append in 24-hour mode', () => {
    const { container } = render(ui(<ClockMinimalView {...viewProps({ showAmPm: true, format24h: true })} />));
    expect(container.textContent).toBe('14:05');
  });
});

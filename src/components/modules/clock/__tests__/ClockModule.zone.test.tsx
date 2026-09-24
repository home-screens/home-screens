// @vitest-environment jsdom

/**
 * The Clock module reads its time of day with Intl on the real instant, so a
 * household time inside the machine's own spring-forward gap is drawn as it
 * is. On 2026-03-08 Chicago skips 02:00 to 03:00 while London reads 02:30 at
 * 02:30 UTC; a Chicago laptop used to draw London's clock as 3:30.
 *
 * Run under `TZ=America/Chicago` to exercise the gap; every other zone must
 * give the same answers.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { preloadDateLocale } from '@/i18n';
import enUSModules from '@/translations/en-US/modules.json';
import daDKModules from '@/translations/da-DK/modules.json';
import { getModuleDefinition } from '@/lib/module-registry';
import { DEFAULT_MODULE_STYLE, type ClockConfig } from '@/types/config';
import ClockModule from '../ClockModule';

const LONDON = 'Europe/London';
const GAP_INSTANT = new Date('2026-03-08T02:30:00Z');

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(async () => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  await preloadDateLocale('da-DK');
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function clockConfig(over: Partial<ClockConfig> = {}): ClockConfig {
  return {
    ...(getModuleDefinition('clock')!.defaultConfig as unknown as ClockConfig),
    hourFormat: '12h',
    showSeconds: false,
    ...over,
  };
}

function renderAt(instant: Date, config: ClockConfig, timezone: string, locale = 'en-US') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(instant);
  const modules = locale === 'da-DK' ? daDKModules : enUSModules;
  const { container } = render(
    <I18nProvider locale={locale} blob={{ modules }}>
      <ClockModule config={config} style={{ ...DEFAULT_MODULE_STYLE }} timezone={timezone} />
    </I18nProvider>,
  );
  return container.textContent ?? '';
}

describe("Clock module inside the machine zone's spring-forward gap", () => {
  it('Classic draws 2:30, not 3:30', () => {
    const text = renderAt(GAP_INSTANT, clockConfig(), LONDON);
    expect(text).toContain('2:30');
    expect(text).not.toContain('3:30');
    expect(text).toContain('Sunday, March 8');
  });

  it('Word view says half past two', () => {
    const text = renderAt(GAP_INSTANT, clockConfig({ view: 'word', showDate: false }), LONDON).toLowerCase();
    expect(text).toContain('two');
    expect(text).not.toContain('three');
  });

  it('World view rows read each zone from the same instant', () => {
    const config = clockConfig({
      view: 'world',
      worldZones: [
        { label: 'Kolkata', timezone: 'Asia/Kolkata' },
        { label: 'Chicago', timezone: 'America/Chicago' },
      ],
    });
    const text = renderAt(GAP_INSTANT, config, LONDON);
    expect(text).toContain('2:30'); // London
    expect(text).toContain('8:00'); // Kolkata, same day
    expect(text).toContain('8:30'); // Chicago, Saturday evening
    expect(text).toContain('-1'); // Chicago is still on the day before
  });
});

describe('Clock date line default', () => {
  it("follows the language's own order when no pattern is set", () => {
    const text = renderAt(new Date('2026-09-25T10:00:00Z'), clockConfig({ dateFormat: '', hourFormat: '24h' }), 'Europe/Copenhagen', 'da-DK');
    expect(text).toContain('fredag 25. september');
  });

  it("keeps a clock's own pattern", () => {
    const text = renderAt(new Date('2026-09-25T10:00:00Z'), clockConfig({ dateFormat: 'd/M/yyyy', hourFormat: '24h' }), 'Europe/Copenhagen', 'da-DK');
    expect(text).toContain('25/9/2026');
  });
});

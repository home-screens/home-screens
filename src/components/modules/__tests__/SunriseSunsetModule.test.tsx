// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { DEFAULT_MODULE_STYLE, type SunriseSunsetConfig, type ModuleStyle } from '@/types/config';
import SunriseSunsetModule from '../SunriseSunsetModule';

// The module reads the current instant through useRealClock (60s ticks) —
// pin it per-test so the day/night split is deterministic. Munich on
// 2026-08-18: sunrise 06:13 CEST (04:13Z), sunset 20:24 CEST (18:24Z).
const clock = vi.hoisted(() => ({ now: new Date(0) }));
vi.mock('@/hooks/useTZClock', () => ({
  useRealClock: () => clock.now,
  useTZClock: () => clock.now,
}));

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

const LAT = 48.1351;
const LON = 11.582;

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

function renderModule(now: Date, overrides: Partial<SunriseSunsetConfig> = {}) {
  clock.now = now;
  const config: SunriseSunsetConfig = {
    view: 'circle',
    showDayLength: true,
    showGoldenHour: false,
    ...overrides,
  };
  return render(
    <Wrapper>
      <SunriseSunsetModule
        config={config}
        style={style}
        latitude={LAT}
        longitude={LON}
      />
    </Wrapper>,
  );
}

/** The circle view's now-marker glow: circle filled with the radial gradient. */
function glowEl(container: HTMLElement): Element | null {
  return container.querySelector('circle[fill^="url(#circle-sun-glow"]');
}

describe('SunriseSunsetModule circle view — sun glow off at night', () => {
  afterEach(() => cleanup());

  it('renders the glow during daylight (after sunrise, before sunset)', () => {
    // 12:00 CEST Aug 18 2026 — mid-day Munich
    const { container } = renderModule(new Date('2026-08-18T12:00:00+02:00'));
    expect(glowEl(container)).toBeTruthy();
  });

  it('turns the glow off after sunset', () => {
    // 23:00 CEST — sun set at 20:24
    const { container } = renderModule(new Date('2026-08-18T23:00:00+02:00'));
    expect(glowEl(container)).toBeNull();
  });

  it('turns the glow off before sunrise', () => {
    // 03:00 CEST — sunrise at 06:13
    const { container } = renderModule(new Date('2026-08-18T03:00:00+02:00'));
    expect(glowEl(container)).toBeNull();
  });

  it('dims the now-marker dot at night instead of the daytime yellow', () => {
    // 23:00 CEST — dot should be slate grey / low opacity like the arc view's night sun
    const { container } = renderModule(new Date('2026-08-18T23:00:00+02:00'));
    const dot = [...container.querySelectorAll('circle')].find(
      (c) => c.getAttribute('r') === '4.5',
    );
    expect(dot).toBeTruthy();
    expect(dot!.getAttribute('fill')).toBe('#64748b');
    expect(dot!.getAttribute('fill-opacity')).toBe('0.4');
  });

  it('keeps the daytime marker yellow with full opacity', () => {
    const { container } = renderModule(new Date('2026-08-18T12:00:00+02:00'));
    const dot = [...container.querySelectorAll('circle')].find(
      (c) => c.getAttribute('r') === '4.5',
    );
    expect(dot).toBeTruthy();
    expect(dot!.getAttribute('fill')).toBe('#fbbf24');
    expect(dot!.getAttribute('fill-opacity')).toBe('1');
  });

  it('keeps the glow off through polar night (no sunrise/sunset at all)', () => {
    // Svalbard in the dead of winter: sun never rises, so sunProgress is NaN
    // and the dial renders the all-night ring without a glow.
    clock.now = new Date('2026-12-21T12:00:00+01:00');
    const config: SunriseSunsetConfig = {
      view: 'circle',
      showDayLength: true,
      showGoldenHour: false,
      showAstroDark: true,
    };
    const { container } = render(
      <Wrapper>
        <SunriseSunsetModule
          config={config}
          style={style}
          latitude={78.22}
          longitude={15.63}
        />
      </Wrapper>,
    );
    expect(glowEl(container)).toBeNull();
  });
});

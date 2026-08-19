// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { DEFAULT_MODULE_STYLE, type SunriseSunsetConfig, type ModuleStyle } from '@/types/config';
import SunriseSunsetModule, { NIGHT_SUN_COLOR, NIGHT_SUN_OPACITY } from '../SunriseSunsetModule';

// The module reads the current instant through useRealClock (60s ticks) —
// pin it per-test so the day/night split is deterministic. Only useRealClock
// is stubbed: if a component in this tree ever adopts useTZClock, the missing
// export fails loudly instead of silently returning an unshifted clock.
// Munich on 2026-08-18: sunrise 06:13 CEST (04:13Z), sunset 20:24 CEST (18:24Z).
const clock = vi.hoisted(() => ({ now: new Date(0) }));
vi.mock('@/hooks/useTZClock', () => ({
  useRealClock: () => clock.now,
}));

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

const MUNICH = { latitude: 48.1351, longitude: 11.582 };

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

function renderModule(
  now: Date,
  overrides: Partial<SunriseSunsetConfig> = {},
  location: { latitude: number; longitude: number } = MUNICH,
) {
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
        latitude={location.latitude}
        longitude={location.longitude}
      />
    </Wrapper>,
  );
}

/** The circle view's now-marker glow: circle filled with the radial gradient. */
function glowEl(container: HTMLElement): Element | null {
  return container.querySelector('circle[fill^="url(#circle-sun-glow"]');
}

/** The circle view's now-marker dot — the only r=4.5 circle on the dial. */
function nowDot(container: HTMLElement): Element | null {
  return [...container.querySelectorAll('circle')].find(
    (c) => c.getAttribute('r') === '4.5',
  ) ?? null;
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
    const dot = nowDot(container);
    expect(dot).toBeTruthy();
    expect(dot!.getAttribute('fill')).toBe(NIGHT_SUN_COLOR);
    expect(dot!.getAttribute('fill-opacity')).toBe(String(NIGHT_SUN_OPACITY));
  });

  it('keeps the daytime marker yellow with full opacity', () => {
    const { container } = renderModule(new Date('2026-08-18T12:00:00+02:00'));
    const dot = nowDot(container);
    expect(dot).toBeTruthy();
    expect(dot!.getAttribute('fill')).toBe('#fbbf24');
    expect(dot!.getAttribute('fill-opacity')).toBe('1');
  });

  it('keeps the glow off through polar night (no sunrise/sunset at all)', () => {
    // Svalbard in the dead of winter: sun never rises, so sunProgress is NaN
    // and the dial renders the all-night ring without a glow.
    const { container } = renderModule(
      new Date('2026-12-21T12:00:00+01:00'),
      { showAstroDark: true },
      { latitude: 78.22, longitude: 15.63 },
    );
    // The dial must actually render (the sunInvalid && !hasDark early return
    // shows plain text with no SVG, which would make the glow check vacuous).
    expect(nowDot(container)).toBeTruthy();
    expect(glowEl(container)).toBeNull();
  });
});

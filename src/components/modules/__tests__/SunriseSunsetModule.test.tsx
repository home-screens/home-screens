// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import SunCalc from 'suncalc';
import { render, cleanup } from '@testing-library/react';
import { astroDarkWindow, circleAngle, hoursInTZ, SKY_THEME_COLORS } from '@/lib/sun-astro';
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
const TROMSO = { latitude: 69.6492, longitude: 18.9553 };

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

describe('SunriseSunsetModule circle view — sky theme', () => {
  afterEach(() => cleanup());

  /** Ring path strokes: the gradient ring has hundreds of distinct colors, the flat
      segments at most three. */
  const ringStrokes = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('svg path')]
      .map((p) => p.getAttribute('stroke'))
      .filter((s): s is string => s != null);

  const stars = (container: HTMLElement): Element[] =>
    [...container.querySelectorAll('circle')].filter((c) => c.getAttribute('r') === '0.5');

  it('renders a many-color gradient ring instead of the flat three segments', () => {
    // mid-August Munich: showAstroDark gives the dark anchors, but the gradient
    // exists on sun events alone
    const { container } = renderModule(new Date('2026-08-18T12:00:00+02:00'), { theme: 'sky' });
    expect(new Set(ringStrokes(container)).size).toBeGreaterThan(10);
    // and keeps the now-marker on the sky sun-disc color with its glow
    const dot = nowDot(container);
    expect(dot!.getAttribute('fill')).toBe('#fbbf24');
    expect(glowEl(container)).not.toBeNull();
  });

  it('scatters the seeded stars through the dark window only when astrodark is on', () => {
    const now = new Date('2026-08-18T12:00:00+02:00');
    const { container } = renderModule(now, { theme: 'sky', showAstroDark: true });
    expect(stars(container)).toHaveLength(30);
    // The module runs without a timezone prop, so hoursInTZ falls back to machine-local
    // hours — derive the expected dark band from the same suncalc data rather than
    // hardcoding CEST angles.
    const times = SunCalc.getTimes(now, MUNICH.latitude, MUNICH.longitude);
    const next = SunCalc.getTimes(new Date(now.getTime() + 86_400_000), MUNICH.latitude, MUNICH.longitude);
    const window = astroDarkWindow(times, next);
    expect(window).not.toBeNull();
    const dbDeg = circleAngle(hoursInTZ(window!.begins));
    const spanDeg = ((((hoursInTZ(window!.ends) - hoursInTZ(window!.begins)) % 24) + 24) % 24) * 15;
    for (const star of stars(container)) {
      const x = Number(star.getAttribute('cx'));
      const y = Number(star.getAttribute('cy'));
      const deg = ((Math.atan2(x - 125, 125 - y) * 180) / Math.PI + 360) % 360;
      const along = ((deg - dbDeg) % 360 + 360) % 360; // clockwise distance from dark begins
      expect(along).toBeLessThanOrEqual(spanDeg + 1); // +1° for coordinate rounding
      const o = Number(star.getAttribute('fill-opacity'));
      expect(o).toBeGreaterThanOrEqual(0.25);
      expect(o).toBeLessThanOrEqual(0.8);
    }
    // same dark window, same seed → same star positions on a second render
    const second = renderModule(new Date('2026-08-18T12:00:00+02:00'), { theme: 'sky', showAstroDark: true });
    expect(stars(second.container).map((s) => [s.getAttribute('cx'), s.getAttribute('cy')]))
      .toEqual(stars(container).map((s) => [s.getAttribute('cx'), s.getAttribute('cy')]));

    // sky theme forces the dark window on: stars and dark labels render even with
    // Show Astro Dark off (Minnesota-style mid-latitude August has a dark window)
    const forced = renderModule(new Date('2026-08-18T12:00:00+02:00'), { theme: 'sky' });
    expect(stars(forced.container)).toHaveLength(30);
    expect(forced.container.textContent).toContain('Dark begins');
  });

  it('keeps the simple theme honest about the toggle: no astrodark setting, no dark window', () => {
    const { container } = renderModule(new Date('2026-08-18T12:00:00+02:00'), { theme: 'simple' });
    expect(stars(container)).toHaveLength(0);
    expect(container.textContent).not.toContain('Dark begins');
  });

  it('keeps the simple theme on the flat segments (no gradient, no stars)', () => {
    const { container } = renderModule(new Date('2026-08-18T12:00:00+02:00'), { theme: 'simple', showAstroDark: true });
    expect(new Set(ringStrokes(container)).size).toBeLessThanOrEqual(3);
    expect(stars(container)).toHaveLength(0);
  });

  it('renders the midnight-sun dial: flat noon ring, sun up around the clock', () => {
    // Tromsø at the summer solstice — no sunset, no astrodark.
    const { container } = renderModule(
      new Date('2026-06-21T12:00:00+02:00'),
      { theme: 'sky', showAstroDark: true },
      TROMSO,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    // one flat noon-colored ring instead of gradient slices; no stars, no event markers
    const rings = [...container.querySelectorAll('circle')].filter((c) => c.getAttribute('r') === '82');
    expect(rings.some((c) => c.getAttribute('stroke') === SKY_THEME_COLORS.noon)).toBe(true);
    expect(container.querySelectorAll('svg path')).toHaveLength(0);
    expect(stars(container)).toHaveLength(0);
    // the sun never sets: day-styled marker with its glow at any hour
    expect(nowDot(container)!.getAttribute('fill')).toBe(SKY_THEME_COLORS.sunDisc);
    expect(glowEl(container)).not.toBeNull();
    expect(container.textContent).toContain('Midnight sun');
  });

  it('renders the polar-night dial: flat dark ring with stars all around', () => {
    // Tromsø at the winter solstice — no sunrise, but a long astrodark window.
    const { container } = renderModule(
      new Date('2026-12-21T12:00:00+01:00'),
      { theme: 'sky', showAstroDark: true },
      TROMSO,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    const rings = [...container.querySelectorAll('circle')].filter((c) => c.getAttribute('r') === '82');
    expect(rings.some((c) => c.getAttribute('stroke') === SKY_THEME_COLORS.darkBegins)).toBe(true);
    expect(container.querySelectorAll('svg path')).toHaveLength(0);
    // stars around the whole dial, not just the dark window — both halves populated
    const allStars = stars(container);
    expect(allStars).toHaveLength(30);
    const degs = allStars.map((s) => {
      const x = Number(s.getAttribute('cx'));
      const y = Number(s.getAttribute('cy'));
      return ((Math.atan2(x - 125, 125 - y) * 180) / Math.PI + 360) % 360;
    });
    expect(degs.some((d) => d < 90 || d > 270)).toBe(true); // day half
    expect(degs.some((d) => d > 90 && d < 270)).toBe(true); // night half
    // sun down all day: night marker, no glow; dark markers + caption still render
    expect(nowDot(container)!.getAttribute('fill')).toBe(NIGHT_SUN_COLOR);
    expect(glowEl(container)).toBeNull();
    expect(container.textContent).toContain('Dark begins');
    expect(container.textContent).toContain('Polar night');
  });

  it('renders the simple theme’s midnight-sun dial: flat daylight ring, no stars', () => {
    const { container } = renderModule(
      new Date('2026-06-21T12:00:00+02:00'),
      { theme: 'simple' },
      TROMSO,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    const rings = [...container.querySelectorAll('circle')].filter((c) => c.getAttribute('r') === '82');
    expect(rings.some((c) => c.getAttribute('stroke') === '#fbbf24')).toBe(true);
    expect(container.querySelectorAll('svg path')).toHaveLength(0);
    expect(stars(container)).toHaveLength(0);
    // sun up around the clock in the simple palette too
    expect(nowDot(container)!.getAttribute('fill')).toBe('#fbbf24');
    expect(glowEl(container)).not.toBeNull();
    expect(container.textContent).toContain('Midnight sun');
  });

  it('renders the simple theme’s polar-night dial as flat twilight when there is no dark window', () => {
    // 89°N on Feb 10: the sun sits near −13° all day — it never rises and never
    // reaches −18°, so there is no astrodark window either (verified with suncalc).
    const { container } = renderModule(
      new Date('2026-02-10T12:00:00+01:00'),
      { theme: 'simple', showAstroDark: true },
      { latitude: 89, longitude: 0 },
    );
    expect(container.querySelector('svg')).toBeTruthy();
    const rings = [...container.querySelectorAll('circle')].filter((c) => c.getAttribute('r') === '82');
    expect(rings.some((c) => c.getAttribute('stroke') === '#aa670e')).toBe(true);
    expect(container.querySelectorAll('svg path')).toHaveLength(0);
    expect(stars(container)).toHaveLength(0);
    expect(nowDot(container)!.getAttribute('fill')).toBe(NIGHT_SUN_COLOR);
    expect(glowEl(container)).toBeNull();
    expect(container.textContent).toContain('Polar night');
    expect(container.textContent).not.toContain('Dark begins');
  });
});

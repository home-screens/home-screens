// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Instrument, isShortCell, sunArcHeight } from '../cards';
import type { WeatherViewProps } from '../weather-view-utils';

// Medium type on a portrait wall: one unit is 10.8 px for both.
const s = 10.8;
const u = 10.8;

describe('sunArcHeight', () => {
  it('draws the arc at full height in a card with room to spare', () => {
    // The default portrait Conditions card is near-square, about 500 px.
    expect(sunArcHeight({ land: false, width: 500, height: 500 }, s, u)).toBeCloseTo(s * 6.6);
    expect(sunArcHeight({ land: true, width: 420, height: 330 }, s, u)).toBeCloseTo(s * 8);
  });

  it('gives the arc up before the time line, in a card the shared floor still calls tall enough', () => {
    // Six rows of cards on a portrait wall: 224 px cards, which the shared
    // short-cell rule passes (224 - 12.5 s is over 8 s) while the lead
    // time above the arc leaves it no room at all.
    const ctx = { land: false, width: 500, height: 224 };
    expect(isShortCell(ctx, s)).toBe(false);
    expect(sunArcHeight(ctx, s, u)).toBeNull();
  });

  it('shortens the arc to what is left between its floor and its full height', () => {
    // 12.5 s reserved, 6 s + u for the time: 19.5 units, then 5 units of room.
    const h = sunArcHeight({ land: false, width: 500, height: (12.5 + 6 + 1 + 5) * s }, s, u);
    expect(h).toBeCloseTo(s * 5);
  });

  it('keeps the full arc for a card of unknown size', () => {
    expect(sunArcHeight({ land: false }, s, u)).toBeCloseTo(s * 6.6);
  });
});

describe('the moon card', () => {
  const p = {
    scale: { s, u }, units: 'imperial', timeFormat: '12h', locale: 'en-US',
    now: new Date('2026-10-24T20:00:00Z'), timezone: 'America/Chicago',
    latitude: 44.7, longitude: -93.4, hourly: [], forecast: [], config: {},
    t: (key: string, vars?: Record<string, string | number>) => (key === 'fullscreen-weather.cards.moon' ? 'Moon' : `${key}${vars ? JSON.stringify(vars) : ''}`),
  } as unknown as WeatherViewProps;

  it('labels itself "Moon" and gives the phase name a line of its own', () => {
    // The phase name as the label was tracked uppercase on one line and a
    // 293 px landscape card cut it to "WAXING GIBBO...".
    for (const ctx of [{ land: true, width: 293, height: 300 }, { land: true, width: 293, height: 180 }]) {
      const { container, unmount } = render(<Instrument p={p} card="moon" ctx={ctx} />);
      const label = container.querySelector('[data-testid="fsw-card-moon"] > div');
      expect(label?.textContent).toBe('Moon');
      expect(container.querySelector('[data-testid="fsw-moon-phase"]')?.textContent).toMatch(/^fullscreen-weather\.moon\.\w+$/);
      unmount();
    }
  });
});

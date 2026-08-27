import { describe, it, expect } from 'vitest';
import { effectiveWeatherPlacement, VIEW_TRAITS } from '../view-traits';
import type { FullscreenCalendarView, WeatherPlacement } from '@/types/config';

const VIEWS = Object.keys(VIEW_TRAITS) as FullscreenCalendarView[];
const PLACEMENTS: WeatherPlacement[] = ['off', 'header', 'days', 'events', 'days-and-events'];

describe('effectiveWeatherPlacement', () => {
  it('never degrades a placement to nothing', () => {
    for (const view of VIEWS) {
      for (const weatherPlacement of PLACEMENTS) {
        const got = effectiveWeatherPlacement(view, { weatherPlacement });
        if (weatherPlacement === 'off') expect(got).toBe('off');
        else expect(got).not.toBe('off');
      }
    }
  });

  it('keeps every surface the view can actually draw', () => {
    // The failure this pins: up-next draws event weather but has no day
    // headers, so 'days-and-events' fell through both combination branches to
    // the header pill — making the richer setting show strictly less than
    // 'events' did on the very same view.
    for (const view of VIEWS) {
      const { days, events } = VIEW_TRAITS[view].weather;
      const got = effectiveWeatherPlacement(view, { weatherPlacement: 'days-and-events' });
      expect(got, `${view} with days-and-events`).toBe(
        days && events ? 'days-and-events' : days ? 'days' : events ? 'events' : 'header',
      );
    }
  });

  it('resolves days-and-events to events on up-next, which has no day headers', () => {
    expect(VIEW_TRAITS['up-next'].weather).toEqual({ days: false, events: true });
    expect(effectiveWeatherPlacement('up-next', { weatherPlacement: 'days-and-events' })).toBe('events');
    expect(effectiveWeatherPlacement('up-next', { weatherPlacement: 'events' })).toBe('events');
    expect(effectiveWeatherPlacement('up-next', { weatherPlacement: 'days' })).toBe('header');
  });

  it('falls back to the header pill for views with no weather surfaces at all', () => {
    for (const view of ['month-grid', 'day-timeline', 'free-time'] as FullscreenCalendarView[]) {
      expect(VIEW_TRAITS[view].weather).toEqual({ days: false, events: false });
      expect(effectiveWeatherPlacement(view, { weatherPlacement: 'days-and-events' })).toBe('header');
    }
  });

  it('honors the legacy showWeather boolean when no placement is stored', () => {
    expect(effectiveWeatherPlacement('week-list', { showWeather: false })).toBe('off');
    expect(effectiveWeatherPlacement('week-list', { showWeather: true })).toBe('header');
  });
});

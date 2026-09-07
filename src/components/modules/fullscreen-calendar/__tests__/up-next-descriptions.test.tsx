// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { FullscreenCalendarConfig } from '@/types/config';
import type { CalendarEvent } from '../view-support';
import { installResizeObserverStub, I18nWrapper as Wrapper, testScale } from '../../__tests__/helpers/harness';

installResizeObserverStub();

import { UpNextView } from '../UpNextView';

/**
 * jsdom lays nothing out, so the board's overflow check is simulated: the
 * root's clientHeight is whatever the test says the box is, and its
 * scrollHeight grows by a fixed amount per description currently drawn.
 * That is enough to drive the level machine (2 = card and rows, 1 = card
 * only, 0 = none) through the paths that matter.
 */
const box = { clientHeight: 1000, textScale: 1 };
const BASE_H = 100;
const PER_DESCRIPTION_H = 40;

const descriptors = {
  clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
  scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
};

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => box.clientHeight });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      const drawn = (this.textContent?.match(/DESC/g) ?? []).length;
      return BASE_H + drawn * PER_DESCRIPTION_H * box.textScale;
    },
  });
});

afterAll(() => {
  for (const [name, d] of Object.entries(descriptors)) {
    if (d) Object.defineProperty(HTMLElement.prototype, name, d);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  }
});

afterEach(() => {
  cleanup();
  box.textScale = 1;
});

const config = {
  view: 'up-next', density: 'cozy', typographySize: 'medium', accentColor: '', dimPastEvents: false, shadeWeekends: false,
  startDay: 'monday', upNextShowDescription: true, upNextLaterCount: 3,
} as FullscreenCalendarConfig;

// Monday Aug 24 2026, 3:40 PM.
const today = new Date(2026, 7, 24);
const now = new Date(2026, 7, 24, 15, 40);

const events: CalendarEvent[] = [
  { id: 'next', title: 'Soccer practice', start: '2026-08-24T16:30:00', end: '2026-08-24T18:00:00', allDay: false, description: 'HERO DESC' },
  { id: 'later', title: 'Family dinner', start: '2026-08-24T18:30:00', end: '2026-08-24T19:30:00', allDay: false, description: 'ROW DESC' },
];

function drawn(container: HTMLElement) {
  const text = container.textContent ?? '';
  return { hero: text.includes('HERO DESC'), row: text.includes('ROW DESC') };
}

/** The board's root: under the mock, "fits" means its last row is inside the box. */
function fits(container: HTMLElement) {
  const root = container.querySelector('[aria-label]') as HTMLElement;
  return root.scrollHeight <= root.clientHeight;
}

describe('UpNextView description levels', () => {
  it('keeps every description when the board fits', () => {
    box.clientHeight = 1000;
    const { container } = render(
      <UpNextView events={events} config={config} scale={testScale()} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(drawn(container)).toEqual({ hero: true, row: true });
  });

  it('sheds the row descriptions first, keeping the card, when only they overflow', () => {
    // Two descriptions = 180 > 150; one = 140 fits.
    box.clientHeight = 150;
    const { container } = render(
      <UpNextView events={events} config={config} scale={testScale()} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(drawn(container)).toEqual({ hero: true, row: false });
  });

  it('keeps shedding after a resize that starts with the rows already hidden', () => {
    box.clientHeight = 150;
    const { container, rerender } = render(
      <UpNextView events={events} config={config} scale={testScale()} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(drawn(container)).toEqual({ hero: true, row: false });

    // The box shrinks so that even the card's description overflows
    // (one description = 140 > 120). The attempt restarts at level 2 and
    // must walk all the way down to 0, not stop one step short.
    box.clientHeight = 120;
    rerender(<UpNextView events={events} config={config} scale={testScale({ height: 1200 })} today={today} now={now} />);
    expect(drawn(container)).toEqual({ hero: false, row: false });
  });

  it('rechecks when the type grows with no resize, so the last row stays inside the box', () => {
    box.clientHeight = 150;
    box.textScale = 1;
    const { container, rerender } = render(
      <UpNextView events={events} config={config} scale={testScale()} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(drawn(container)).toEqual({ hero: true, row: false });
    expect(fits(container)).toBe(true);

    // Larger typography at the same box: the card's description alone now
    // overflows (100 + 40 * 1.5 = 160 > 150). Nothing about the box or the
    // events changed, only the type size, and the board must still notice.
    box.textScale = 1.5;
    rerender(<UpNextView events={events} config={config} scale={testScale({ typoMul: 1.5 })} today={today} now={now} />);
    expect(drawn(container)).toEqual({ hero: false, row: false });
    expect(fits(container)).toBe(true);
  });

  it('rechecks when density changes with no resize', () => {
    box.clientHeight = 150;
    box.textScale = 1;
    const { container, rerender } = render(
      <UpNextView events={events} config={config} scale={testScale()} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(drawn(container)).toEqual({ hero: true, row: false });

    box.textScale = 1.5;
    rerender(<UpNextView events={events} config={config} scale={testScale({ densityMul: 1.5 })} today={today} now={now} />);
    expect(drawn(container)).toEqual({ hero: false, row: false });
    expect(fits(container)).toBe(true);
  });

  it('brings descriptions back when the board grows again', () => {
    box.clientHeight = 120;
    const { container, rerender } = render(
      <UpNextView events={events} config={config} scale={testScale({ height: 1200 })} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(drawn(container)).toEqual({ hero: false, row: false });

    box.clientHeight = 1000;
    rerender(<UpNextView events={events} config={config} scale={testScale()} today={today} now={now} />);
    expect(drawn(container)).toEqual({ hero: true, row: true });
  });

  it('draws nothing extra when the toggle is off, whatever the box', () => {
    box.clientHeight = 1000;
    const { container } = render(
      <UpNextView events={events} config={{ ...config, upNextShowDescription: false }} scale={testScale()} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(drawn(container)).toEqual({ hero: false, row: false });
  });
});

// @vitest-environment jsdom

/**
 * Reproduction harness for the reported bug: with two day rules, the second
 * rule's picture picker showed the first rule's art and clicks would not
 * change it. Drives the real CalendarRulesEditor with a stateful parent,
 * exactly how the config section owns the rules list.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { useState } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { CalendarRulesEditor } from '../config-sections/CalendarRulesEditor';
import type { CalendarDayRule } from '@/types/config';

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => (url.startsWith('/api/backgrounds/directories') ? { directories: [] }
      : url.startsWith('/api/auth/google/apps') ? { photos: { mode: 'own', hostedAvailable: false } }
        : url.startsWith('/api/secrets') ? {}
          : []),
  })),
  isSessionExpired: () => false,
  sessionExpired: () => new Error('expired'),
}));

function Harness({ initial, stateRef }: {
  initial: CalendarDayRule[];
  stateRef?: { current: CalendarDayRule[] | undefined };
}) {
  const [dayRules, setDayRules] = useState<CalendarDayRule[] | undefined>(initial);
  if (stateRef) stateRef.current = dayRules;
  return (
    <I18nProvider locale="en-US" blob={{}}>
      <CalendarRulesEditor
        eventRules={undefined}
        dayRules={dayRules}
        availableSources={[]}
        onChange={(p) => setDayRules(p.dayRules)}
      />
    </I18nProvider>
  );
}

const HALLOWEEN = '/starter-day-art/halloween.svg';

/** Rules render collapsed; open the card so its fields exist. */
const expand = async (card: Element) => {
  await act(async () => {
    fireEvent.click(card.querySelector('[data-rule-toggle]')!);
  });
};

describe('two day rules with picture backgrounds', () => {
  afterEach(cleanup);

  it("the second rule's picker picks its own art, independent of the first", async () => {
    const { container } = render(
      <Harness
        initial={[
          { id: 'r1', match: { dayOfMonth: 31, months: [9] }, backgroundImage: HALLOWEEN },
          { id: 'r2', match: {} },
        ]}
      />,
    );
    const cards = container.querySelectorAll('[data-rule-card]');
    expect(cards).toHaveLength(2);
    const card2 = cards[1];
    await expand(cards[0]);
    await expand(card2);

    // Card 2: Background -> Picture. In an empty-match card the selects run
    // Which days, Events on day, Background. The Background one is last.
    const selects = card2.querySelectorAll('select');
    await act(async () => {
      fireEvent.change(selects[selects.length - 1], { target: { value: 'picture' } });
    });
    const picker = card2.querySelector('[data-day-art-picker]');
    expect(picker, 'picture picker rendered in card 2').toBeTruthy();

    // Card 1 holds Halloween; card 2 must not (it seeded its own art).
    const name = (card: Element) => card.querySelector('[data-testid="day-art-name"]')?.textContent;
    expect(name(cards[0])).toMatch(/halloween/i);
    expect(name(card2)).not.toMatch(/halloween/i);

    // Pick birthday on card 2, in the Image Library its field opens.
    await act(async () => {
      fireEvent.click(picker!.querySelector('[data-testid="day-art-choose"]')!);
    });
    await act(async () => {
      fireEvent.click(card2.querySelector('[data-testid="starter-picture-birthday"]')!);
    });
    await act(async () => {
      fireEvent.click(card2.querySelector('[data-testid="picker-confirm"]')!);
    });

    // Card 2 now holds birthday; card 1 is unchanged.
    expect(name(card2)).toMatch(/birthday/i);
    expect(name(cards[0])).toMatch(/halloween/i);
  });
});

describe('picture mode owns the whole background choice', () => {
  afterEach(cleanup);

  const backgroundSelect = (card: Element) => {
    const selects = card.querySelectorAll('select');
    return selects[selects.length - 1];
  };

  it('entering picture mode clears a plain color and the art carries the look alone', async () => {
    const stateRef: { current: CalendarDayRule[] | undefined } = { current: undefined };
    const { container } = render(
      <Harness initial={[{ id: 'r1', match: {}, background: '#ff0000' }]} stateRef={stateRef} />,
    );
    const card = container.querySelector('[data-rule-card]')!;
    await expand(card);
    await act(async () => {
      fireEvent.change(backgroundSelect(card), { target: { value: 'picture' } });
    });
    expect(stateRef.current?.[0].background).toBeUndefined();
    expect(stateRef.current?.[0].backgroundImage).toBe('/starter-day-art/celebrate.svg');
  });
});

describe('day-rule art scale and position sliders', () => {
  afterEach(cleanup);

  it('picture cards show the three sliders; defaults write back as undefined', async () => {
    const stateRef: { current: CalendarDayRule[] | undefined } = { current: undefined };
    const { container } = render(
      <Harness initial={[{ id: 'r1', match: {}, backgroundImage: HALLOWEEN }]} stateRef={stateRef} />,
    );
    const card = container.querySelector('[data-rule-card]')!;
    await expand(card);
    // Picture branch renders: dimming, size, X, Y, then the card's fade slider.
    const ranges = card.querySelectorAll('input[type="range"]');
    expect(ranges.length).toBeGreaterThanOrEqual(4);
    expect((ranges[1] as HTMLInputElement).value).toBe('100');
    expect((ranges[2] as HTMLInputElement).value).toBe('50');
    expect((ranges[3] as HTMLInputElement).value).toBe('50');
    // Size and position step by 2; dimming keeps its coarser step of 5.
    expect((ranges[1] as HTMLInputElement).step).toBe('2');
    expect((ranges[2] as HTMLInputElement).step).toBe('2');
    expect((ranges[3] as HTMLInputElement).step).toBe('2');
    expect((ranges[0] as HTMLInputElement).step).toBe('5');

    await act(async () => { fireEvent.change(ranges[1], { target: { value: '40' } }); });
    await act(async () => { fireEvent.change(ranges[2], { target: { value: '0' } }); });
    await act(async () => { fireEvent.change(ranges[3], { target: { value: '100' } }); });
    expect(stateRef.current?.[0].backgroundScale).toBe(40);
    expect(stateRef.current?.[0].backgroundPositionX).toBe(0);
    expect(stateRef.current?.[0].backgroundPositionY).toBe(100);

    // Back to defaults → stored as undefined.
    const again = card.querySelectorAll('input[type="range"]');
    await act(async () => { fireEvent.change(again[1], { target: { value: '100' } }); });
    await act(async () => { fireEvent.change(again[2], { target: { value: '50' } }); });
    await act(async () => { fireEvent.change(again[3], { target: { value: '50' } }); });
    expect(stateRef.current?.[0].backgroundScale).toBeUndefined();
    expect(stateRef.current?.[0].backgroundPositionX).toBeUndefined();
    expect(stateRef.current?.[0].backgroundPositionY).toBeUndefined();
  });

  it('leaving picture mode clears scale and position with the art', async () => {
    const stateRef: { current: CalendarDayRule[] | undefined } = { current: undefined };
    const { container } = render(
      <Harness
        initial={[{
          id: 'r1', match: {}, backgroundImage: HALLOWEEN,
          backgroundScale: 40, backgroundPositionX: 0, backgroundPositionY: 100,
        }]}
        stateRef={stateRef}
      />,
    );
    const card = container.querySelector('[data-rule-card]')!;
    await expand(card);
    const selects = card.querySelectorAll('select');
    await act(async () => {
      fireEvent.change(selects[selects.length - 1], { target: { value: 'none' } });
    });
    expect(stateRef.current?.[0].backgroundImage).toBeUndefined();
    expect(stateRef.current?.[0].backgroundScale).toBeUndefined();
    expect(stateRef.current?.[0].backgroundPositionX).toBeUndefined();
    expect(stateRef.current?.[0].backgroundPositionY).toBeUndefined();
  });
});

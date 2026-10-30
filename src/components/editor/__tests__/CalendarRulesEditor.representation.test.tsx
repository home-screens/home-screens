// @vitest-environment jsdom

/**
 * The day-rule card derives its controls from the rule, and the engine
 * accepts more shapes than the card can author: a month with no day, a
 * date pattern beside `when` or picked weekdays, a color under a picture
 * (all legal, all reachable by hand editing or a layout import). Every one
 * of those has to read as what the wall does with it, and the first edit
 * must not narrow the rule behind the user's back.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { useState } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { CalendarRulesEditor } from '../config-sections/CalendarRulesEditor';
import type { CalendarDayRule } from '@/types/config';

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: vi.fn(async () => ({ ok: true, json: async () => [] })),
}));

function Harness({ initial, stateRef, locale = 'en-US' }: {
  initial: CalendarDayRule[];
  stateRef: { current: CalendarDayRule[] | undefined };
  locale?: string;
}) {
  const [dayRules, setDayRules] = useState<CalendarDayRule[] | undefined>(initial);
  stateRef.current = dayRules;
  return (
    <I18nProvider locale={locale} blob={{}}>
      <CalendarRulesEditor
        eventRules={undefined}
        dayRules={dayRules}
        availableSources={[]}
        onChange={(p) => setDayRules(p.dayRules)}
      />
    </I18nProvider>
  );
}

const selectValues = (card: Element) => Array.from(card.querySelectorAll('select')).map((s) => s.value);
const weekdayButtons = (card: Element) => Array.from(card.querySelectorAll('button[aria-pressed]'));
const ref = () => ({ current: undefined as CalendarDayRule[] | undefined });

/** Rules render collapsed; open the card so its fields exist. */
const expand = async (card: Element) => {
  await act(async () => {
    fireEvent.click(card.querySelector('[data-rule-toggle]')!);
  });
};

describe('day-rule cards represent every legal match', () => {
  afterEach(cleanup);

  it('a month with no day reads as "every day of one month" with that month picked', async () => {
    const stateRef = ref();
    const { container } = render(<Harness initial={[{ id: 'r1', match: { months: [11] } }]} stateRef={stateRef} />);
    const card = container.querySelector('[data-rule-card]')!;
    await expand(card);
    // Which days, Pattern, Month, Events on day, Background: no Day select
    // claiming "the 1st" for a rule that badges all of December.
    expect(selectValues(card)).toEqual(['specific', 'whole-month', '11', 'ignore', 'none']);
    const monthSelect = card.querySelectorAll('select')[2];
    expect(monthSelect.options[monthSelect.selectedIndex].textContent).toBe('December');
    // A whole month has no "every month" escape hatch.
    expect(Array.from(monthSelect.options).map((o) => o.value)).not.toContain('');
  });

  it('month labels follow the formatting locale, not a dictionary', async () => {
    const stateRef = ref();
    const { container } = render(<Harness initial={[{ id: 'r1', match: { months: [2] } }]} stateRef={stateRef} locale="de-DE" />);
    await expand(container.querySelector('[data-rule-card]')!);
    const monthSelect = container.querySelectorAll('select')[2];
    expect(monthSelect.options[monthSelect.selectedIndex].textContent).toBe('März');
  });

  it('picking the whole-month pattern keeps the month and drops the day', async () => {
    const stateRef = ref();
    const { container } = render(<Harness initial={[{ id: 'r1', match: { dayOfMonth: 20, months: [5] } }]} stateRef={stateRef} />);
    const card = container.querySelector('[data-rule-card]')!;
    await expand(card);
    expect(selectValues(card)[1]).toBe('yearly-day');
    await act(async () => {
      fireEvent.change(card.querySelectorAll('select')[1], { target: { value: 'whole-month' } });
    });
    expect(stateRef.current?.[0].match).toEqual({ months: [5] });
  });

  it('weekday picks beside a date pattern stay visible and editable', async () => {
    const stateRef = ref();
    const { container } = render(<Harness initial={[{ id: 'r1', match: { dayOfMonth: 20, daysOfWeek: [4] } }]} stateRef={stateRef} />);
    const card = container.querySelector('[data-rule-card]')!;
    await expand(card);
    expect(selectValues(card)[0]).toBe('specific');
    // The row shows because the wall ANDs Thursday with the 20th.
    expect(weekdayButtons(card)).toHaveLength(7);
    expect(weekdayButtons(card)[4].getAttribute('aria-pressed')).toBe('true');
    // Unpicking it removes the field and the row folds away under Specific days.
    await act(async () => {
      fireEvent.click(weekdayButtons(card)[4]);
    });
    expect(stateRef.current?.[0].match).toEqual({ dayOfMonth: 20 });
    expect(weekdayButtons(card)).toHaveLength(0);
  });

  it('a `when` beside a date pattern is settled in favor of the select on the first edit', async () => {
    const stateRef = ref();
    const { container } = render(<Harness initial={[{ id: 'r1', match: { dayOfMonth: 20, when: 'today' } }]} stateRef={stateRef} />);
    const card = container.querySelector('[data-rule-card]')!;
    await expand(card);
    // Day select is the third select (Which days, Pattern, Day).
    await act(async () => {
      fireEvent.change(card.querySelectorAll('select')[2], { target: { value: '21' } });
    });
    expect(stateRef.current?.[0].match).toEqual({ dayOfMonth: 21 });
  });

  it('a plain color under a picture stays reachable', async () => {
    const stateRef = ref();
    const { container } = render(
      <Harness initial={[{ id: 'r1', match: {}, background: '#3b82f6', backgroundImage: '/starter-day-art/sprinkles.svg' }]} stateRef={stateRef} />,
    );
    const card = container.querySelector('[data-rule-card]')!;
    await expand(card);
    expect(selectValues(card).at(-1)).toBe('picture');
    const color = card.querySelector('input[type="color"]') as HTMLInputElement | null;
    expect(color, 'color picker rendered next to the picture').toBeTruthy();
    expect(color!.value).toBe('#3b82f6');
  });

  it('a picture alone shows no color picker', async () => {
    const stateRef = ref();
    const { container } = render(
      <Harness initial={[{ id: 'r1', match: {}, backgroundImage: '/starter-day-art/sprinkles.svg' }]} stateRef={stateRef} />,
    );
    await expand(container.querySelector('[data-rule-card]')!);
    expect(container.querySelector('input[type="color"]')).toBeNull();
  });
});

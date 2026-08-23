import { describe, it, expect } from 'vitest';
import {
  NO_DECOR,
  applyEventRules,
  autoDayTint,
  eventGlyph,
  eventOpacity,
  matchesDay,
  matchesEvent,
  resolveDayDecor,
  rulesNeedNow,
} from '../calendar-rules';
import type { CalendarEvent, CalendarEventRule, CalendarDayRule } from '@/types/config';

const now = new Date('2026-08-20T15:00:00');
const today = new Date('2026-08-20T00:00:00');
const ctx = { now, today };

function ev(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: over.id ?? 'e1',
    title: 'Soccer practice',
    start: '2026-08-20T16:30:00',
    end: '2026-08-20T18:00:00',
    allDay: false,
    calendarColor: '#EC4899',
    sourceId: 'ava',
    ...over,
  };
}

describe('matchesEvent', () => {
  it('matches everything with an empty match', () => {
    expect(matchesEvent({}, ev(), ctx)).toBe(true);
    expect(matchesEvent(undefined, ev(), ctx)).toBe(true);
  });

  it('title contains is case-insensitive and the default mode', () => {
    expect(matchesEvent({ text: 'SOCCER' }, ev(), ctx)).toBe(true);
    expect(matchesEvent({ text: 'piano' }, ev(), ctx)).toBe(false);
  });

  it('exact and pattern modes', () => {
    expect(matchesEvent({ text: 'soccer practice', textMatch: 'exact' }, ev(), ctx)).toBe(true);
    expect(matchesEvent({ text: 'soccer', textMatch: 'exact' }, ev(), ctx)).toBe(false);
    expect(matchesEvent({ text: '^soc+er', textMatch: 'regex' }, ev(), ctx)).toBe(true);
  });

  it('an invalid pattern matches nothing instead of throwing', () => {
    expect(matchesEvent({ text: '(', textMatch: 'regex' }, ev(), ctx)).toBe(false);
  });

  it('ANDs every set field', () => {
    const m = { text: 'soccer', sourceIds: ['ava', 'ben'], allDay: false };
    expect(matchesEvent(m, ev(), ctx)).toBe(true);
    expect(matchesEvent(m, ev({ sourceId: 'cora' }), ctx)).toBe(false);
    expect(matchesEvent(m, ev({ allDay: true }), ctx)).toBe(false);
  });

  it('source match fails for events without a sourceId', () => {
    expect(matchesEvent({ sourceIds: ['ava'] }, ev({ sourceId: undefined }), ctx)).toBe(false);
  });

  it('location is a substring match', () => {
    expect(matchesEvent({ location: 'lakefront' }, ev({ location: 'Lakefront Park, Prior Lake' }), ctx)).toBe(true);
    expect(matchesEvent({ location: 'lakefront' }, ev(), ctx)).toBe(false);
  });

  it('past reads the clock', () => {
    const ended = ev({ start: '2026-08-20T08:00:00', end: '2026-08-20T09:00:00' });
    expect(matchesEvent({ past: true }, ended, ctx)).toBe(true);
    expect(matchesEvent({ past: true }, ev(), ctx)).toBe(false);
    expect(matchesEvent({ past: false }, ev(), ctx)).toBe(true);
  });

  it('kind treats unset as a plain event', () => {
    expect(matchesEvent({ kind: 'event' }, ev(), ctx)).toBe(true);
    expect(matchesEvent({ kind: 'birthday' }, ev(), ctx)).toBe(false);
    expect(matchesEvent({ kind: 'birthday' }, ev({ kind: 'birthday' }), ctx)).toBe(true);
  });
});

describe('applyEventRules', () => {
  it('returns the same array when there are no rules', () => {
    const events = [ev()];
    expect(applyEventRules(events, undefined, ctx)).toBe(events);
    expect(applyEventRules(events, [], ctx)).toBe(events);
  });

  it('keeps object identity for events no rule changes', () => {
    const events = [ev(), ev({ id: 'e2', title: 'Piano' })];
    const rules: CalendarEventRule[] = [{ id: 'r', match: { text: 'piano' }, color: '#000' }];
    const out = applyEventRules(events, rules, ctx);
    expect(out[0]).toBe(events[0]);
    expect(out[1]).not.toBe(events[1]);
    expect(out[1].calendarColor).toBe('#000');
  });

  it('hides matching events', () => {
    const rules: CalendarEventRule[] = [{ id: 'r', match: { text: 'lunch' }, hide: true }];
    const out = applyEventRules([ev({ title: 'Lunch' }), ev({ id: 'e2' })], rules, ctx);
    expect(out.map((e) => e.id)).toEqual(['e2']);
  });

  it('first rule wins per property, later rules fill in the rest', () => {
    const rules: CalendarEventRule[] = [
      { id: 'a', match: { text: 'soccer' }, color: '#111' },
      { id: 'b', match: {}, color: '#222', icon: '⚽', opacity: 0.5, title: 'Renamed' },
    ];
    const [out] = applyEventRules([ev()], rules, ctx);
    expect(out.calendarColor).toBe('#111');
    expect(out.icon).toBe('⚽');
    expect(out.opacity).toBe(0.5);
    expect(out.title).toBe('Renamed');
  });

  it('clamps opacity and ignores blank icon / title', () => {
    const rules: CalendarEventRule[] = [{ id: 'a', match: {}, opacity: 5, icon: '  ', title: '' }];
    const [out] = applyEventRules([ev()], rules, ctx);
    expect(out.opacity).toBe(1);
    expect(out.icon).toBeUndefined();
    expect(out.title).toBe('Soccer practice');
  });
});

describe('rulesNeedNow', () => {
  it('is true only when a match reads past', () => {
    expect(rulesNeedNow([{ id: 'a', match: { text: 'x' } }], undefined)).toBe(false);
    expect(rulesNeedNow([{ id: 'a', match: { past: true } }], undefined)).toBe(true);
    expect(rulesNeedNow(undefined, [{ id: 'd', match: { withEvents: 'matching', eventMatch: { past: false } } }])).toBe(true);
    expect(rulesNeedNow(undefined, [{ id: 'd', match: { withEvents: 'matching', eventMatch: { text: 'x' } } }])).toBe(false);
  });
});

describe('matchesDay', () => {
  const yesterday = new Date('2026-08-19T00:00:00');
  const tomorrow = new Date('2026-08-21T00:00:00');

  it('when: today / past / future', () => {
    expect(matchesDay({ when: 'today' }, today, [], ctx)).toBe(true);
    expect(matchesDay({ when: 'today' }, tomorrow, [], ctx)).toBe(false);
    expect(matchesDay({ when: 'past' }, yesterday, [], ctx)).toBe(true);
    expect(matchesDay({ when: 'past' }, today, [], ctx)).toBe(false);
    expect(matchesDay({ when: 'future' }, tomorrow, [], ctx)).toBe(true);
    expect(matchesDay({ when: 'future' }, today, [], ctx)).toBe(false);
  });

  it('daysOfWeek', () => {
    // 2026-08-22 is a Saturday
    const sat = new Date('2026-08-22T00:00:00');
    expect(matchesDay({ daysOfWeek: [0, 6] }, sat, [], ctx)).toBe(true);
    expect(matchesDay({ daysOfWeek: [0, 6] }, today, [], ctx)).toBe(false);
    expect(matchesDay({ daysOfWeek: [] }, today, [], ctx)).toBe(true);
  });

  it('withEvents any / none / matching', () => {
    expect(matchesDay({ withEvents: 'any' }, today, [], ctx)).toBe(false);
    expect(matchesDay({ withEvents: 'any' }, today, [ev()], ctx)).toBe(true);
    expect(matchesDay({ withEvents: 'none' }, today, [ev()], ctx)).toBe(false);
    expect(matchesDay({ withEvents: 'matching', eventMatch: { text: 'soccer' } }, today, [ev()], ctx)).toBe(true);
    expect(matchesDay({ withEvents: 'matching', eventMatch: { text: 'piano' } }, today, [ev()], ctx)).toBe(false);
  });
});

describe('resolveDayDecor', () => {
  it('returns the shared empty decor with no rules', () => {
    const a = resolveDayDecor(today, [], undefined, ctx);
    const b = resolveDayDecor(today, [], [], ctx);
    expect(a).toBe(b);
    expect(a.badges).toEqual([]);
  });

  it('first-wins style, stacked badges', () => {
    const rules: CalendarDayRule[] = [
      { id: 'a', match: { when: 'today' }, background: '#fef3c7', badgeIcon: '⭐' },
      { id: 'b', match: {}, background: '#000', borderColor: '#f00', badgeText: 'Game day', badgeColor: '#0f0' },
      { id: 'c', match: { when: 'past' }, badgeIcon: 'never' },
    ];
    const decor = resolveDayDecor(today, [], rules, ctx);
    expect(decor.background).toBe('#fef3c7');
    expect(decor.borderColor).toBe('#f00');
    expect(decor.badges).toEqual([{ icon: '⭐' }, { text: 'Game day', color: '#0f0' }]);
  });

  it('auto background tints from the day events', () => {
    const rules: CalendarDayRule[] = [{ id: 'a', match: {}, background: 'auto' }];
    expect(resolveDayDecor(today, [], rules, ctx).background).toBeUndefined();
    expect(resolveDayDecor(today, [ev()], rules, ctx, { autoTintAlpha: 0.2 }).background).toBe('rgba(236,72,153,0.2)');
  });
});

describe('badge fields that are blank strings', () => {
  it('produce no badge (the editor clears them to undefined, engine ignores either way)', () => {
    const rules: CalendarDayRule[] = [{ id: 'a', match: {}, badgeIcon: '', badgeText: '  ', badgeColor: '#f00' }];
    expect(resolveDayDecor(today, [], rules, ctx).badges).toEqual([]);
  });
});

describe('autoDayTint', () => {
  it('dedupes colors and falls back to color-mix for non-hex values', () => {
    const events = [ev(), ev({ id: 'e2' }), ev({ id: 'e3', calendarColor: 'tomato' })];
    expect(autoDayTint(events, 0.1)).toBe(
      'linear-gradient(180deg, rgba(236,72,153,0.1), color-mix(in srgb, tomato 10%, transparent))',
    );
  });
});

describe('NO_DECOR', () => {
  it('is the shared identity a no-rules day array can be filled with', () => {
    expect(NO_DECOR.badges).toEqual([]);
    expect(resolveDayDecor(today, [], [], ctx)).toBe(NO_DECOR);
  });
});

describe('glyph and opacity helpers', () => {
  it('a rule icon beats the kind glyph', () => {
    expect(eventGlyph({ kind: 'birthday' })).toBe('🎂');
    expect(eventGlyph({ kind: 'birthday', icon: '🎈' })).toBe('🎈');
    expect(eventGlyph({})).toBeNull();
  });

  it('multiplies numeric bases and wraps CSS var bases in calc', () => {
    expect(eventOpacity({}, 0.4)).toBe(0.4);
    expect(eventOpacity({ opacity: 0.5 }, 0.4)).toBe(0.2);
    expect(eventOpacity({ opacity: 0.5 }, 'var(--x)')).toBe('calc(var(--x) * 0.5)');
  });
});

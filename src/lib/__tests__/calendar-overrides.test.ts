import { describe, it, expect } from 'vitest';
import { applyCalendarOverrides } from '@/lib/calendar-overrides';
import type { CalendarEvent } from '@/types/config';

const ev = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1', title: 'Thing', start: '2026-11-05T10:00', end: '2026-11-05T11:00',
  sourceId: 'work', sourceName: 'work@example.com', calendarColor: '#1a73e8',
  ...over,
} as CalendarEvent);

describe('applyCalendarOverrides', () => {
  it('returns the same array when there is nothing to apply', () => {
    const events = [ev()];
    expect(applyCalendarOverrides(events, undefined)).toBe(events);
    expect(applyCalendarOverrides(events, {})).toBe(events);
  });

  it('replaces the name and colour for a matching source', () => {
    const [out] = applyCalendarOverrides([ev()], { work: { name: 'Work', color: '#10b981' } });
    expect(out.sourceName).toBe('Work');
    expect(out.calendarColor).toBe('#10b981');
  });

  it('leaves other sources untouched', () => {
    const out = applyCalendarOverrides(
      [ev(), ev({ id: 'e2', sourceId: 'home', sourceName: 'Home', calendarColor: '#abc' })],
      { work: { name: 'Work' } },
    );
    expect(out[0].sourceName).toBe('Work');
    expect(out[1].sourceName).toBe('Home');
    expect(out[1].calendarColor).toBe('#abc');
  });

  it('keeps the original when a field is absent, so a half-filled override never blanks it', () => {
    const [nameOnly] = applyCalendarOverrides([ev()], { work: { name: 'Work' } });
    expect(nameOnly.sourceName).toBe('Work');
    expect(nameOnly.calendarColor).toBe('#1a73e8');

    const [colorOnly] = applyCalendarOverrides([ev()], { work: { color: '#10b981' } });
    expect(colorOnly.sourceName).toBe('work@example.com');
    expect(colorOnly.calendarColor).toBe('#10b981');
  });

  it('treats a whitespace-only name as absent', () => {
    const [out] = applyCalendarOverrides([ev()], { work: { name: '   ' } });
    expect(out.sourceName).toBe('work@example.com');
  });

  it('overrides a per-event colour too', () => {
    // Google can colour one event individually. Letting those through would
    // mean setting "this calendar is green" and watching a third of its
    // events stay blue, with a legend dot matching neither.
    const [out] = applyCalendarOverrides(
      [ev({ calendarColor: '#ff0000' })],
      { work: { color: '#10b981' } },
    );
    expect(out.calendarColor).toBe('#10b981');
  });

  it('ignores events with no sourceId', () => {
    const orphan = ev({ sourceId: undefined });
    const [out] = applyCalendarOverrides([orphan], { work: { name: 'Work' } });
    expect(out).toBe(orphan);
  });

  it('does not mutate the input events', () => {
    const input = ev();
    applyCalendarOverrides([input], { work: { name: 'Work', color: '#10b981' } });
    expect(input.sourceName).toBe('work@example.com');
    expect(input.calendarColor).toBe('#1a73e8');
  });
});

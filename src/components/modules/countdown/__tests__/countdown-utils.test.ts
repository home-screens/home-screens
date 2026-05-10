import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTimeRemaining, pad, resolveEventDate, processEvents } from '../countdown-utils';
import type { CountdownEvent } from '@/types/config';

afterEach(() => {
  vi.useRealTimers();
});

describe('pad', () => {
  it('pads single digits with leading zero', () => {
    expect(pad(0)).toBe('00');
    expect(pad(5)).toBe('05');
    expect(pad(9)).toBe('09');
  });

  it('does not pad double digits', () => {
    expect(pad(10)).toBe('10');
    expect(pad(59)).toBe('59');
  });

  it('does not pad triple digits', () => {
    expect(pad(100)).toBe('100');
  });
});

describe('getTimeRemaining', () => {
  it('returns positive values for a future date', () => {
    // Set a fixed "now" and target 1 day, 2 hours, 3 minutes, 4 seconds ahead
    const now = new Date('2026-03-15T12:00:00');
    vi.setSystemTime(now);

    const result = getTimeRemaining('2026-03-16T14:03:04');
    expect(result.past).toBe(false);
    expect(result.days).toBe(1);
    expect(result.hours).toBe(2);
    expect(result.minutes).toBe(3);
    expect(result.seconds).toBe(4);
    expect(result.totalMs).toBeGreaterThan(0);
  });

  it('returns past=true for a date in the past', () => {
    vi.setSystemTime(new Date('2026-03-15T12:00:00'));
    const result = getTimeRemaining('2026-03-14T12:00:00');
    expect(result.past).toBe(true);
    expect(result.days).toBe(1);
    expect(result.totalMs).toBeLessThan(0);
  });

  it('returns zeroes when target is exactly now', () => {
    vi.setSystemTime(new Date('2026-03-15T12:00:00'));
    const result = getTimeRemaining('2026-03-15T12:00:00');
    expect(result.days).toBe(0);
    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
    expect(result.seconds).toBe(0);
    expect(result.past).toBe(false);
  });
});

describe('resolveEventDate', () => {
  it('returns the original date for non-recurring events', () => {
    const event: CountdownEvent = {
      id: '1',
      name: 'Birthday',
      date: '2026-12-25T00:00',
    };
    expect(resolveEventDate(event)).toBe('2026-12-25T00:00');
  });

  it('returns this year if the recurring date has not passed yet', () => {
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const event: CountdownEvent = {
      id: '1',
      name: 'Christmas',
      date: '2025-12-25T00:00',
      recurring: 'yearly',
    };
    const result = resolveEventDate(event);
    expect(result).toBe('2026-12-25T00:00');
  });

  it('returns next year if the recurring date has already passed', () => {
    vi.setSystemTime(new Date('2026-12-26T12:00:00'));
    const event: CountdownEvent = {
      id: '1',
      name: 'Christmas',
      date: '2025-12-25T00:00',
      recurring: 'yearly',
    };
    const result = resolveEventDate(event);
    expect(result).toBe('2027-12-25T00:00');
  });

  it('preserves time component from the original date', () => {
    vi.setSystemTime(new Date('2026-01-01T12:00:00'));
    const event: CountdownEvent = {
      id: '1',
      name: 'New Year Countdown',
      date: '2025-12-31T23:59',
      recurring: 'yearly',
    };
    const result = resolveEventDate(event);
    expect(result).toBe('2026-12-31T23:59');
  });

  it('returns original date when date string is unparseable', () => {
    const event: CountdownEvent = {
      id: '1',
      name: 'Bad Date',
      date: 'not-a-date',
      recurring: 'yearly',
    };
    expect(resolveEventDate(event)).toBe('not-a-date');
  });

  it('keeps the current year for a recurring event still on its day when stayUntilEndOfDay is true', () => {
    // Christmas at 00:00, "now" is Christmas afternoon — without the flag this jumps to 2027.
    vi.setSystemTime(new Date('2026-12-25T15:00:00'));
    const event: CountdownEvent = {
      id: '1',
      name: 'Christmas',
      date: '2025-12-25T00:00',
      recurring: 'yearly',
    };
    expect(resolveEventDate(event, undefined, true)).toBe('2026-12-25T00:00');
  });

  it('still rolls a recurring event forward the day after, even with stayUntilEndOfDay', () => {
    vi.setSystemTime(new Date('2026-12-26T00:00:01'));
    const event: CountdownEvent = {
      id: '1',
      name: 'Christmas',
      date: '2025-12-25T00:00',
      recurring: 'yearly',
    };
    expect(resolveEventDate(event, undefined, true)).toBe('2027-12-25T00:00');
  });
});

describe('processEvents', () => {
  it('filters out past events when showPastEvents is false', () => {
    vi.setSystemTime(new Date('2026-03-15T12:00:00'));

    const events: CountdownEvent[] = [
      { id: '1', name: 'Past', date: '2026-03-10T00:00' },
      { id: '2', name: 'Future', date: '2026-03-20T00:00' },
    ];

    const result = processEvents(events, false);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Future');
  });

  it('includes past events when showPastEvents is true', () => {
    vi.setSystemTime(new Date('2026-03-15T12:00:00'));

    const events: CountdownEvent[] = [
      { id: '1', name: 'Past', date: '2026-03-10T00:00' },
      { id: '2', name: 'Future', date: '2026-03-20T00:00' },
    ];

    const result = processEvents(events, true);
    expect(result).toHaveLength(2);
  });

  it('sorts future events before past, then by totalMs ascending', () => {
    vi.setSystemTime(new Date('2026-03-15T12:00:00'));

    const events: CountdownEvent[] = [
      { id: '1', name: 'Far Future', date: '2026-06-01T00:00' },
      { id: '2', name: 'Past', date: '2026-03-01T00:00' },
      { id: '3', name: 'Near Future', date: '2026-03-20T00:00' },
    ];

    const result = processEvents(events, true);
    expect(result[0].name).toBe('Near Future');
    expect(result[1].name).toBe('Far Future');
    expect(result[2].name).toBe('Past');
  });

  it('handles empty events array', () => {
    const result = processEvents([], false);
    expect(result).toEqual([]);
  });

  it('resolves recurring event dates before processing', () => {
    vi.setSystemTime(new Date('2026-12-26T12:00:00'));

    const events: CountdownEvent[] = [
      { id: '1', name: 'Christmas', date: '2025-12-25T00:00', recurring: 'yearly' },
    ];

    const result = processEvents(events, false);
    // Christmas 2026 already passed (it's Dec 26), so it resolves to 2027
    expect(result).toHaveLength(1);
    expect(result[0].time.past).toBe(false);
  });

  it('keeps a passed event visible the rest of the day when stayUntilEndOfDay is true', () => {
    vi.setSystemTime(new Date('2026-03-15T18:30:00'));

    const events: CountdownEvent[] = [
      { id: '1', name: 'Party', date: '2026-03-15T12:00' }, // earlier today
      { id: '2', name: 'Future', date: '2026-03-20T00:00' },
    ];

    const result = processEvents(events, false, undefined, true);
    expect(result).toHaveLength(2);
    // Today-but-passed sorts first
    expect(result[0].name).toBe('Party');
    expect(result[0].stayingForToday).toBe(true);
    expect(result[0].time.past).toBe(true);
    expect(result[1].name).toBe('Future');
    expect(result[1].stayingForToday).toBe(false);
  });

  it('does not keep yesterday\'s event when stayUntilEndOfDay is true', () => {
    vi.setSystemTime(new Date('2026-03-15T01:00:00'));

    const events: CountdownEvent[] = [
      { id: '1', name: 'Yesterday', date: '2026-03-14T20:00' },
      { id: '2', name: 'Future', date: '2026-03-20T00:00' },
    ];

    const result = processEvents(events, false, undefined, true);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Future');
  });

  it('keeps a recurring event on its day with stayUntilEndOfDay even after midnight of the event time', () => {
    vi.setSystemTime(new Date('2026-12-25T15:00:00'));

    const events: CountdownEvent[] = [
      { id: '1', name: 'Christmas', date: '2025-12-25T00:00', recurring: 'yearly' },
    ];

    const result = processEvents(events, false, undefined, true);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Christmas');
    expect(result[0].stayingForToday).toBe(true);
  });

  it('marks future events with stayingForToday=false', () => {
    vi.setSystemTime(new Date('2026-03-15T12:00:00'));

    const events: CountdownEvent[] = [
      { id: '1', name: 'Future', date: '2026-03-20T00:00' },
    ];

    const result = processEvents(events, false, undefined, true);
    expect(result[0].stayingForToday).toBe(false);
  });
});

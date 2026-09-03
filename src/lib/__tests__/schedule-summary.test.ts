import { describe, it, expect } from 'vitest';
import { describeSchedule, formatScheduleDays, formatScheduleTime } from '@/lib/schedule-summary';
import en from '@/translations/en-US/editor.json';

/** Minimal stand-in for the real translator: dotted lookup + {token} fill. */
function t(key: string, vars?: Record<string, string | number>): string {
  const value = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en);
  const template = typeof value === 'string' ? value : key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? `{${name}}`));
}

describe('formatScheduleDays', () => {
  it('names the three shapes people actually pick', () => {
    expect(formatScheduleDays({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }, t, 'en-US')).toBe('every day');
    expect(formatScheduleDays({ daysOfWeek: [1, 2, 3, 4, 5] }, t, 'en-US')).toBe('Mon to Fri');
    expect(formatScheduleDays({ daysOfWeek: [0, 6] }, t, 'en-US')).toBe('Sat and Sun');
  });

  it('lists anything else in week order, whatever order it was stored in', () => {
    expect(formatScheduleDays({ daysOfWeek: [5, 1, 3] }, t, 'en-US')).toBe('Mon, Wed, Fri');
  });

  it('treats an absent day list as every day, which is what the display does', () => {
    expect(formatScheduleDays(undefined, t, 'en-US')).toBe('every day');
    expect(formatScheduleDays({}, t, 'en-US')).toBe('every day');
  });
});

describe('formatScheduleTime', () => {
  it('reads a half-set window as all day, because that is how it behaves', () => {
    expect(formatScheduleTime({ startTime: '07:00' }, t, 'en-US', '12h')).toBe('all day');
    expect(formatScheduleTime({ endTime: '09:00' }, t, 'en-US', '12h')).toBe('all day');
    expect(formatScheduleTime({}, t, 'en-US', '12h')).toBe('all day');
  });

  it('follows the household clock preference', () => {
    const window = { startTime: '07:00', endTime: '21:30' };
    expect(formatScheduleTime(window, t, 'en-US', '12h')).toBe('7:00 AM to 9:30 PM');
    expect(formatScheduleTime(window, t, 'en-US', '24h')).toBe('07:00 to 21:30');
  });

  it('names the closing day when the window runs past midnight', () => {
    // Implicit overnight: end earlier than start.
    expect(formatScheduleTime({ startTime: '16:00', endTime: '08:00' }, t, 'en-US', '24h'))
      .toBe('16:00 until 08:00 the next day');
    // Explicit multi-day span.
    expect(formatScheduleTime({ startTime: '08:00', endTime: '20:00', endDayOffset: 3 }, t, 'en-US', '24h'))
      .toBe('08:00 until 20:00 3 days later');
    // An explicit same-day offset overrides the implicit wrap.
    expect(formatScheduleTime({ startTime: '16:00', endTime: '08:00', endDayOffset: 0 }, t, 'en-US', '24h'))
      .toBe('16:00 to 08:00');
  });

  it('leaves a malformed stored time alone rather than inventing one', () => {
    expect(formatScheduleTime({ startTime: 'oops', endTime: '09:00' }, t, 'en-US', '24h'))
      .toBe('oops to 09:00');
  });
});

describe('describeSchedule', () => {
  it('says what a plain window does', () => {
    const { short, sentence } = describeSchedule(
      { daysOfWeek: [1, 2, 3, 4, 5], startTime: '07:00', endTime: '09:00' },
      t,
      'en-US',
      '12h',
    );
    expect(short).toBe('Mon to Fri, 7:00 AM to 9:00 AM');
    expect(sentence).toBe('Shows Mon to Fri, 7:00 AM to 9:00 AM.');
  });

  it('flips the sentence for an inverted window without changing the short form', () => {
    const { short, sentence } = describeSchedule(
      { daysOfWeek: [1, 2, 3, 4, 5], startTime: '07:00', endTime: '09:00', invert: true },
      t,
      'en-US',
      '12h',
    );
    expect(short).toBe('Mon to Fri, 7:00 AM to 9:00 AM');
    expect(sentence).toBe('Hidden Mon to Fri, 7:00 AM to 9:00 AM. Shown the rest of the time.');
  });

  it('describes the just-enabled default as the no-op it is', () => {
    expect(describeSchedule({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }, t, 'en-US', '12h').sentence)
      .toBe('Shows every day, all day.');
  });
});

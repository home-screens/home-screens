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
  it('says all day only when neither end of the window is set', () => {
    expect(formatScheduleTime({}, t, 'en-US', '12h')).toBe('all day');
    expect(formatScheduleTime(undefined, t, 'en-US', '12h')).toBe('all day');
    expect(formatScheduleTime({ daysOfWeek: [1, 2, 3] }, t, 'en-US', '12h')).toBe('all day');
  });

  it('names a stretch across days with no times as days, not as one day', () => {
    // Friday to Sunday: Friday's midnight until Monday's.
    expect(formatScheduleTime({ daysOfWeek: [5], endDayOffset: 2 }, t, 'en-US', '12h')).toBe('all day for 3 days');
    expect(describeSchedule({ daysOfWeek: [5], endDayOffset: 2 }, t, 'en-US', '12h').short).toBe('Fri, all day for 3 days');
  });

  it('names a one-sided window, which really does gate most of the day', () => {
    // 6 PM with no end is hidden from midnight to 6 PM, not "all day".
    expect(formatScheduleTime({ startTime: '18:00' }, t, 'en-US', '12h')).toBe('from 6:00 PM');
    expect(formatScheduleTime({ endTime: '09:00' }, t, 'en-US', '12h')).toBe('until 9:00 AM');
  });

  it('follows the household clock preference on a one-sided window too', () => {
    expect(formatScheduleTime({ startTime: '18:00' }, t, 'en-US', '24h')).toBe('from 18:00');
    expect(formatScheduleTime({ endTime: '09:00' }, t, 'en-US', '24h')).toBe('until 09:00');
  });

  it('fills the open end the way the display does when the window also spans days', () => {
    // No end means "to the end of the day", so a span of 1 closes at the
    // midnight two days on.
    expect(formatScheduleTime({ startTime: '18:00', endDayOffset: 1 }, t, 'en-US', '24h'))
      .toBe('18:00 until 00:00 2 days later');
    // No start means "from midnight".
    expect(formatScheduleTime({ endTime: '09:00', endDayOffset: 2 }, t, 'en-US', '24h'))
      .toBe('00:00 until 09:00 2 days later');
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
    // An explicit zero offset means the same as none; the overnight pair still wraps.
    expect(formatScheduleTime({ startTime: '16:00', endTime: '08:00', endDayOffset: 0 }, t, 'en-US', '24h'))
      .toBe('16:00 until 08:00 the next day');
    // Equal times are a full day, and read as one.
    expect(formatScheduleTime({ startTime: '08:00', endTime: '08:00' }, t, 'en-US', '24h'))
      .toBe('08:00 until 08:00 the next day');
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
    expect(describeSchedule({ daysOfWeek: [1, 2, 3, 4, 5] }, t, 'en-US', '12h').sentence)
      .toBe('Shows Mon to Fri, all day.');
  });

  it('carries a one-sided window into both the chip and the sentence', () => {
    const { short, sentence } = describeSchedule(
      { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '18:00' },
      t,
      'en-US',
      '12h',
    );
    expect(short).toBe('every day, from 6:00 PM');
    expect(sentence).toBe('Shows every day, from 6:00 PM.');
  });

  it('flips a one-sided window in the inverted sentence', () => {
    expect(
      describeSchedule({ daysOfWeek: [0, 6], endTime: '09:00', invert: true }, t, 'en-US', '12h')
        .sentence,
    ).toBe('Hidden Sat and Sun, until 9:00 AM. Shown the rest of the time.');
  });
});

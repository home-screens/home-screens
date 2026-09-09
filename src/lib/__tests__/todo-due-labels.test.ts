import { describe, it, expect } from 'vitest';
import { classifyDue, daysBetween, formatDueLabel, localISODate, parseISODate } from '../todo-due-labels';

const WORDS = { today: 'Today', tomorrow: 'Tomorrow', overdue: 'Overdue' };

describe('todo-due-labels', () => {
  it('formats and parses local calendar dates', () => {
    expect(localISODate(new Date(2026, 8, 9))).toBe('2026-09-09');
    expect(parseISODate('2026-09-09')?.getDate()).toBe(9);
    expect(parseISODate('nope')).toBeNull();
    expect(parseISODate('2026-13-40')).not.toBeNull();
  });

  it('counts whole days across a month boundary', () => {
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-10-01', '2026-09-30')).toBe(-1);
    expect(daysBetween('bad', '2026-09-30')).toBeNull();
  });

  it('classifies relative to today', () => {
    const today = '2026-09-09';
    expect(classifyDue('2026-09-09', today)).toBe('today');
    expect(classifyDue('2026-09-10', today)).toBe('tomorrow');
    expect(classifyDue('2026-09-08', today)).toBe('overdue');
    expect(classifyDue('2026-09-12', today)).toBe('weekday');
    expect(classifyDue('2026-09-15', today)).toBe('weekday');
    expect(classifyDue('2026-09-16', today)).toBe('date');
    expect(classifyDue('garbage', today)).toBe('date');
  });

  it('never calls a finished item overdue', () => {
    expect(classifyDue('2026-09-01', '2026-09-09', true)).toBe('date');
  });

  it('formats the chip text', () => {
    const today = '2026-09-09';
    expect(formatDueLabel('2026-09-09', today, 'en-US', WORDS)).toBe('Today');
    expect(formatDueLabel('2026-09-10', today, 'en-US', WORDS)).toBe('Tomorrow');
    expect(formatDueLabel('2026-09-01', today, 'en-US', WORDS)).toBe('Overdue');
    expect(formatDueLabel('2026-09-12', today, 'en-US', WORDS)).toBe('Sat');
    expect(formatDueLabel('2026-10-03', today, 'en-US', WORDS)).toBe('Oct 3');
    expect(formatDueLabel('garbage', today, 'en-US', WORDS)).toBe('garbage');
  });
});

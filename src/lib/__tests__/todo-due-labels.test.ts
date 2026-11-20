import { describe, it, expect } from 'vitest';
import { classifyDue, formatDueLabel, localISODate } from '../todo-due-labels';

const WORDS = { today: 'Today', tomorrow: 'Tomorrow', overdue: 'Overdue' };

describe('todo-due-labels', () => {
  it('formats local calendar dates', () => {
    expect(localISODate(new Date(2026, 8, 9))).toBe('2026-09-09');
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

import { describe, expect, it } from 'vitest';
import { formatRelativeDay } from '../support';

const tCore = ((key: string) => ({ today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday' })[key] ?? key) as Parameters<typeof formatRelativeDay>[2];
const today = new Date(2026, 9, 30);

describe('formatRelativeDay', () => {
  it('names today, tomorrow and yesterday in words', () => {
    expect(formatRelativeDay(new Date(2026, 9, 30, 15), today, tCore, 'en-US')).toBe('Today');
    expect(formatRelativeDay(new Date(2026, 9, 31), today, tCore, 'en-US')).toBe('Tomorrow');
    expect(formatRelativeDay(new Date(2026, 9, 29), today, tCore, 'en-US')).toBe('Yesterday');
  });

  it('writes any other day in the wall\'s own order', () => {
    expect(formatRelativeDay(new Date(2026, 10, 1), today, tCore, 'en-US')).toBe('Sunday, Nov 1');
    expect(formatRelativeDay(new Date(2026, 10, 1), today, tCore, 'de-DE')).toBe('Sonntag, 1. Nov.');
    expect(formatRelativeDay(new Date(2026, 10, 1), today, tCore, 'fr-FR')).toBe('Dimanche 1 nov.');
  });
});

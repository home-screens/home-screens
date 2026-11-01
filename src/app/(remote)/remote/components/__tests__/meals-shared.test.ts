import { describe, it, expect } from 'vitest';
import { formatShownMinutes, readMealsPlace, writeMealsPlace } from '../meals-shared';

describe('formatShownMinutes', () => {
  const words: Record<string, string> = {
    'mealsTab.duration.minutes': '{minutes}m',
    'mealsTab.duration.hours': '{hours}h',
    'mealsTab.duration.hoursMinutes': '{hours}h {minutes}m',
  };
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    words[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name]));

  it('prints minutes, whole hours and hours with minutes', () => {
    expect(formatShownMinutes(45, t)).toBe('45m');
    expect(formatShownMinutes(60, t)).toBe('1h');
    expect(formatShownMinutes(140, t)).toBe('2h 20m');
  });
});

describe('readMealsPlace', () => {
  it('reads the tab and the week the address kept', () => {
    expect(readMealsPlace('?tab=meals&meals=plan&week=2026-11-02')).toEqual({ view: 'plan', week: '2026-11-02' });
    expect(readMealsPlace('?tab=meals&meals=grocery')).toEqual({ view: 'grocery', week: null });
  });

  it('opens on This Week for anything missing or not understood', () => {
    expect(readMealsPlace('')).toEqual({ view: 'week', week: null });
    expect(readMealsPlace('?meals=recipes&week=next')).toEqual({ view: 'week', week: null });
    expect(readMealsPlace('?week=2026-02-31')).toEqual({ view: 'week', week: null });
  });
});

describe('writeMealsPlace', () => {
  it('keeps the place beside the other parameters and leaves This Week out', () => {
    const url = new URL('http://hub.local/remote?tab=meals');
    expect(writeMealsPlace(url, { view: 'library', week: '2026-11-09' })).toBe(true);
    expect(url.search).toBe('?tab=meals&meals=library&week=2026-11-09');
    expect(writeMealsPlace(url, { view: 'library', week: '2026-11-09' })).toBe(false);
    expect(writeMealsPlace(url, { view: 'week', week: null })).toBe(true);
    expect(url.search).toBe('?tab=meals');
  });

  it('reads back what it wrote', () => {
    const url = new URL('http://hub.local/remote?tab=meals');
    writeMealsPlace(url, { view: 'plan', week: '2026-10-26' });
    expect(readMealsPlace(url.search)).toEqual({ view: 'plan', week: '2026-10-26' });
  });
});

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { forgetCelebrated, rememberCelebrated, wasCelebratedToday } from '../celebrated-today';

/** The test environment's storage is a stub, so each test gets a real one of its own. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
  } as Storage;
}
beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: fakeStorage(), configurable: true, writable: true });
});

describe('who was celebrated today', () => {
  it('remembers a finish across a reload and forgets it on a failed save', () => {
    expect(wasCelebratedToday('ada', '2026-10-29')).toBe(false);
    rememberCelebrated('ada', '2026-10-29');
    expect(wasCelebratedToday('ada', '2026-10-29')).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('hs-celebrated-2026-10-29')!)).toEqual(['ada']);
    forgetCelebrated('ada', '2026-10-29');
    expect(wasCelebratedToday('ada', '2026-10-29')).toBe(false);
  });

  it('drops yesterday when today is written, and keeps people apart', () => {
    rememberCelebrated('ada', '2026-10-28');
    rememberCelebrated('bram', '2026-10-29');
    expect(window.localStorage.getItem('hs-celebrated-2026-10-28')).toBeNull();
    expect(wasCelebratedToday('ada', '2026-10-29')).toBe(false);
    expect(wasCelebratedToday('bram', '2026-10-29')).toBe(true);
  });

  it('still works when storage refuses', () => {
    const refusing = fakeStorage();
    refusing.setItem = () => { throw new Error('quota'); };
    Object.defineProperty(window, 'localStorage', { value: refusing, configurable: true, writable: true });
    rememberCelebrated('cleo', '2026-10-29');
    expect(wasCelebratedToday('cleo', '2026-10-29')).toBe(true);
  });
});

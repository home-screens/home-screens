// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readRemembered, readRememberedJson, remember, rememberJson } from '../device-memory';

/** jsdom's localStorage is non-functional under this setup; stub an in-memory one. */
function makeLocalStorage(blocked = false): Storage {
  const store = new Map<string, string>();
  const refuse = () => { throw new Error('blocked'); };
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: blocked ? refuse : (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: blocked ? refuse : (key: string, value: string) => { store.set(key, String(value)); },
  };
}

describe('device memory', () => {
  beforeEach(() => vi.stubGlobal('localStorage', makeLocalStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('reads back what it kept, an empty string included', () => {
    expect(readRemembered('k')).toBeNull();
    remember('k', 'm-noah');
    expect(readRemembered('k')).toBe('m-noah');
    // An empty value is a saved value (a deliberate "Nobody"), not a missing one.
    remember('k', '');
    expect(readRemembered('k')).toBe('');
  });

  it('keeps and reads JSON, and answers null for text that is not JSON', () => {
    rememberJson('folds', { a: true });
    expect(readRememberedJson('folds')).toEqual({ a: true });
    remember('folds', '{not json');
    expect(readRememberedJson('folds')).toBeNull();
    expect(readRememberedJson('missing')).toBeNull();
  });

  it('never throws when storage is blocked: nothing is remembered', () => {
    vi.stubGlobal('localStorage', makeLocalStorage(true));
    expect(readRemembered('k')).toBeNull();
    expect(readRememberedJson('k')).toBeNull();
    expect(() => remember('k', 'v')).not.toThrow();
    expect(() => rememberJson('k', { a: 1 })).not.toThrow();
  });
});

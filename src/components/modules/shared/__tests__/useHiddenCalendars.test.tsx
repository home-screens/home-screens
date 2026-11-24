// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { makeLocalStorage } from '@/test-utils';
import { resetHiddenCalendarsForTest, useHiddenCalendars } from '../useHiddenCalendars';

const KEY = 'hs.calendar.hiddenSources';
const events = [{ id: 'a', sourceId: 'work' }, { id: 'b', sourceId: 'family' }, { id: 'c' }];

describe('useHiddenCalendars', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
    resetHiddenCalendarsForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides and shows the calendars a key row stands for, and remembers them', () => {
    const { result } = renderHook(() => useHiddenCalendars(true));
    expect(result.current.filter(events)).toBe(events);

    act(() => result.current.setShown(['work'], false));
    expect(result.current.filter(events).map((e) => e.id)).toEqual(['b', 'c']);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['work']);

    act(() => result.current.setShown(['work'], true));
    expect(result.current.hidden.size).toBe(0);
    // Nothing hidden leaves nothing behind.
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps two calendars on one screen in step', () => {
    const first = renderHook(() => useHiddenCalendars(true));
    const second = renderHook(() => useHiddenCalendars(true));
    act(() => first.result.current.setShown(['family'], false));
    expect([...second.result.current.hidden]).toEqual(['family']);
  });

  it('hides nothing where there is no key to bring a calendar back', () => {
    localStorage.setItem(KEY, JSON.stringify(['work']));
    const { result } = renderHook(() => useHiddenCalendars(false));
    expect(result.current.hidden.size).toBe(0);
    expect(result.current.filter(events)).toBe(events);
  });

  it('reads what an earlier visit hid, and shrugs off a broken store', () => {
    localStorage.setItem(KEY, JSON.stringify(['work', 7]));
    expect([...renderHook(() => useHiddenCalendars(true)).result.current.hidden]).toEqual(['work']);

    localStorage.setItem(KEY, '{not json');
    resetHiddenCalendarsForTest();
    expect(renderHook(() => useHiddenCalendars(true)).result.current.hidden.size).toBe(0);
  });
});

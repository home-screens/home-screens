// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { KEPT_NOTE_MS, currentKeptNote, forgetKeptNote, keepNote, useKeptNote, type KeptNote } from '../keptNote';
import type { NoteDrawingLine } from '@/types/notes';

const LINES: NoteDrawingLine[] = [{ c: 'ink', w: 0, p: [10, 10, 500, 400] }];
const PAGE: KeptNote = { lines: LINES, text: '', mode: 'draw' };
const WORDS: KeptNote = { lines: [], text: 'Back at 5', mode: 'write' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => forgetKeptNote());
  vi.useRealTimers();
});

describe('the unfinished note a wall keeps', () => {
  it('is offered to every card until it is picked up or thrown away', () => {
    const one = renderHook(() => useKeptNote());
    const other = renderHook(() => useKeptNote());
    expect(one.result.current).toBeNull();
    act(() => keepNote(PAGE));
    expect(one.result.current).toMatchObject(PAGE);
    expect(other.result.current).toMatchObject(PAGE);
    expect(currentKeptNote()).toMatchObject(PAGE);
    act(() => forgetKeptNote());
    expect(one.result.current).toBeNull();
    expect(other.result.current).toBeNull();
  });

  it('keeps typed words, a page, or both, and which one was showing', () => {
    const { result } = renderHook(() => useKeptNote());
    act(() => keepNote(WORDS));
    expect(result.current).toMatchObject(WORDS);
    act(() => keepNote({ lines: LINES, text: 'Back at 5', mode: 'write' }));
    expect(result.current).toMatchObject({ lines: LINES, text: 'Back at 5', mode: 'write' });
  });

  it('runs out of time by itself', () => {
    const { result } = renderHook(() => useKeptNote());
    act(() => keepNote(PAGE));
    act(() => { vi.advanceTimersByTime(KEPT_NOTE_MS - 1000); });
    expect(result.current).toMatchObject(PAGE);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBeNull();
  });

  it('starts its time over when a note is kept again, and keeps nothing for an empty one', () => {
    const { result } = renderHook(() => useKeptNote());
    act(() => keepNote(PAGE));
    act(() => { vi.advanceTimersByTime(KEPT_NOTE_MS - 1000); });
    act(() => keepNote({ ...PAGE, lines: [...LINES, { c: 'red', w: 1, p: [5, 5] }] }));
    act(() => { vi.advanceTimersByTime(KEPT_NOTE_MS - 1000); });
    expect(result.current?.lines).toHaveLength(2);
    act(() => keepNote({ lines: [], text: '   ', mode: 'write' }));
    expect(result.current).toBeNull();
  });
});

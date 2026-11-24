// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { KEPT_DRAWING_MS, forgetKeptDrawing, keepDrawing, useKeptDrawing } from '../keptDrawing';
import type { NoteDrawingLine } from '@/types/notes';

const LINES: NoteDrawingLine[] = [{ c: 'ink', w: 0, p: [10, 10, 500, 400] }];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => forgetKeptDrawing());
  vi.useRealTimers();
});

describe('the unfinished page a wall keeps', () => {
  it('is offered to every card until it is picked up or thrown away', () => {
    const one = renderHook(() => useKeptDrawing());
    const other = renderHook(() => useKeptDrawing());
    expect(one.result.current).toBeNull();
    act(() => keepDrawing(LINES));
    expect(one.result.current).toEqual(LINES);
    expect(other.result.current).toEqual(LINES);
    act(() => forgetKeptDrawing());
    expect(one.result.current).toBeNull();
    expect(other.result.current).toBeNull();
  });

  it('runs out of time by itself', () => {
    const { result } = renderHook(() => useKeptDrawing());
    act(() => keepDrawing(LINES));
    act(() => { vi.advanceTimersByTime(KEPT_DRAWING_MS - 1000); });
    expect(result.current).toEqual(LINES);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBeNull();
  });

  it('starts its time over when a page is kept again, and keeps nothing for an empty page', () => {
    const { result } = renderHook(() => useKeptDrawing());
    act(() => keepDrawing(LINES));
    act(() => { vi.advanceTimersByTime(KEPT_DRAWING_MS - 1000); });
    act(() => keepDrawing([...LINES, { c: 'red', w: 1, p: [5, 5] }]));
    act(() => { vi.advanceTimersByTime(KEPT_DRAWING_MS - 1000); });
    expect(result.current).toHaveLength(2);
    act(() => keepDrawing([]));
    expect(result.current).toBeNull();
  });
});

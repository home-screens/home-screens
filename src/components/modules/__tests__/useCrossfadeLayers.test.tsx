// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { MediaListItem } from '@/types/config';
import { useCrossfadeLayers, FAILED_SLIDE_SKIP_MS } from '../shared/useCrossfadeLayers';

/**
 * The swap between the two slide layers waits for the incoming image. Flipping
 * on the index change alone faded the outgoing photo out over a layer that had
 * nothing to show yet: a slow cloud photo produced a blank frame and a failed
 * one left it blank until the next slide.
 */

const A: MediaListItem = { url: '/api/p/a', type: 'image' };
const B: MediaListItem = { url: '/api/p/b', type: 'image' };
const V: MediaListItem = { url: '/api/v/1', type: 'video' };

function mount(item: MediaListItem, index: number, advance = vi.fn()) {
  const hook = renderHook(
    ({ item, index }) => useCrossfadeLayers(item, index, advance),
    { initialProps: { item, index } },
  );
  return { ...hook, advance };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useCrossfadeLayers', () => {
  it('seeds both layers with the first slide', () => {
    const { result } = mount(A, 0);
    expect(result.current.sources).toEqual([A, A]);
    expect(result.current.activeLayer).toBe(0);
  });

  it('keeps the outgoing layer active until the incoming image reports ready', () => {
    const { result, rerender } = mount(A, 0);
    rerender({ item: B, index: 1 });
    // B is loading in layer 1; A stays on top.
    expect(result.current.sources).toEqual([A, B]);
    expect(result.current.activeLayer).toBe(0);

    act(() => { result.current.layerReady(1); });
    expect(result.current.activeLayer).toBe(1);
  });

  it('ignores a ready report from a layer that is not pending', () => {
    const { result, rerender } = mount(A, 0);
    rerender({ item: B, index: 1 });
    act(() => { result.current.layerReady(0); });
    expect(result.current.activeLayer).toBe(0);
  });

  it('reuses a ready image but forgets readiness when that layer gets another source', () => {
    const { result, rerender } = mount(A, 0);
    act(() => { result.current.layerReady(0); });
    rerender({ item: B, index: 1 });
    act(() => { result.current.layerReady(1); });
    rerender({ item: A, index: 0 });
    expect(result.current.activeLayer).toBe(0);
    rerender({ item: B, index: 1 });
    expect(result.current.activeLayer).toBe(1);

    // Replacing A with an unloaded C discards A's decoded image. Coming
    // back to A before C loads must wait for a fresh load, not reuse that mark.
    rerender({ item: { url: '/api/p/c', type: 'image' }, index: 2 });
    rerender({ item: A, index: 0 });
    expect(result.current.activeLayer).toBe(1);
    act(() => { result.current.layerReady(0); });
    expect(result.current.activeLayer).toBe(0);
  });

  it('does not reuse readiness after a hidden layer reports a failure', () => {
    const { result, rerender, advance } = mount(A, 0);
    act(() => { result.current.layerReady(0); });
    rerender({ item: B, index: 1 });
    act(() => { result.current.layerReady(1); });
    act(() => { result.current.layerFailed(0); });
    rerender({ item: A, index: 0 });
    expect(result.current.activeLayer).toBe(1);
    expect(advance).not.toHaveBeenCalled();
  });

  it('cuts to a video immediately (VideoLayer owns its own loading)', () => {
    const { result, rerender } = mount(A, 0);
    rerender({ item: V, index: 1 });
    expect(result.current.activeLayer).toBe(1);
  });

  it('skips a slide whose image failed, after a short delay, without dropping the outgoing photo', () => {
    const { result, rerender, advance } = mount(A, 0);
    rerender({ item: B, index: 1 });
    act(() => { result.current.layerFailed(1); });
    expect(result.current.activeLayer).toBe(0);
    expect(advance).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(FAILED_SLIDE_SKIP_MS); });
    expect(advance).toHaveBeenCalledTimes(1);
    // A late ready from the failed layer no longer flips anything.
    act(() => { result.current.layerReady(1); });
    expect(result.current.activeLayer).toBe(0);
  });

  it('a failure on the hidden outgoing layer changes nothing', () => {
    const { result, rerender, advance } = mount(A, 0);
    rerender({ item: B, index: 1 });
    act(() => { result.current.layerReady(1); });
    act(() => { result.current.layerFailed(0); });
    act(() => { vi.advanceTimersByTime(FAILED_SLIDE_SKIP_MS); });
    expect(advance).not.toHaveBeenCalled();
    expect(result.current.activeLayer).toBe(1);
  });

  it('a new slide arriving while one is still pending replaces it in the same layer', () => {
    const C: MediaListItem = { url: '/api/p/c', type: 'image' };
    const { result, rerender } = mount(A, 0);
    rerender({ item: B, index: 1 });
    rerender({ item: C, index: 2 });
    expect(result.current.sources).toEqual([A, C]);
    expect(result.current.activeLayer).toBe(0);
    act(() => { result.current.layerReady(1); });
    expect(result.current.activeLayer).toBe(1);
  });
});

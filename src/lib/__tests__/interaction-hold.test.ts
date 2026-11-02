// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  holdRotationFor,
  interactionIsHeld,
  rotationIsHeld,
  useInteractionHold,
  useInteractionHeld,
  useRotationHeld,
} from '@/lib/interaction-hold';

describe('holdRotationFor', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('holds rotation for the given window and then lets go', () => {
    expect(rotationIsHeld()).toBe(false);
    holdRotationFor(1000);
    expect(rotationIsHeld()).toBe(true);
    vi.advanceTimersByTime(999);
    expect(rotationIsHeld()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(rotationIsHeld()).toBe(false);
  });

  /* A kid ticking four chores in a row gets the window from the last tap, not
   * four overlapping holds that each expire on their own schedule. */
  it('extends the window on a second tap rather than stacking holds', () => {
    holdRotationFor(1000);
    vi.advanceTimersByTime(800);
    holdRotationFor(1000);
    vi.advanceTimersByTime(800);
    expect(rotationIsHeld()).toBe(true);
    vi.advanceTimersByTime(200);
    expect(rotationIsHeld()).toBe(false);
  });

  /* Browsing recipes earns a minute; a chip tapped inside that minute is an
   * eight-second tap hold, and used to replace the minute with eight seconds. */
  it('keeps the later end when a shorter hold lands inside a longer one', () => {
    holdRotationFor(60_000);
    vi.advanceTimersByTime(10_000);
    holdRotationFor(8_000);
    vi.advanceTimersByTime(20_000);
    expect(rotationIsHeld()).toBe(true);
    vi.advanceTimersByTime(30_000);
    expect(rotationIsHeld()).toBe(false);
  });

  it('ends early when released', () => {
    const release = holdRotationFor(1000);
    holdRotationFor(500);
    release();
    expect(rotationIsHeld()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(rotationIsHeld()).toBe(false);
  });

  it('ignores a window of zero or less', () => {
    holdRotationFor(0);
    expect(rotationIsHeld()).toBe(false);
  });

  /* A flick right after ticking a chore is someone asking for the next screen.
   * The tap hold used to share the overlay's counter, so the wall ignored every
   * flick for eight seconds after any tap. */
  it('holds the rotation timer without holding the display', () => {
    holdRotationFor(1000);
    expect(rotationIsHeld()).toBe(true);
    expect(interactionIsHeld()).toBe(false);
  });
});

describe('hold hooks', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('an open overlay holds both rotation and the display until it closes', () => {
    const held = renderHook(() => ({ display: useInteractionHeld(), rotation: useRotationHeld() }));
    expect(held.result.current).toEqual({ display: false, rotation: false });
    const overlay = renderHook(() => useInteractionHold());
    expect(held.result.current).toEqual({ display: true, rotation: true });
    overlay.unmount();
    expect(held.result.current).toEqual({ display: false, rotation: false });
  });

  it('a tap holds rotation but not the display, and lets go on its own', () => {
    const held = renderHook(() => ({ display: useInteractionHeld(), rotation: useRotationHeld() }));
    act(() => { holdRotationFor(1000); });
    expect(held.result.current).toEqual({ display: false, rotation: true });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(held.result.current).toEqual({ display: false, rotation: false });
  });

  it('a tap ending does not release an overlay still open', () => {
    const held = renderHook(() => ({ display: useInteractionHeld(), rotation: useRotationHeld() }));
    const overlay = renderHook(() => useInteractionHold());
    act(() => { holdRotationFor(1000); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(held.result.current).toEqual({ display: true, rotation: true });
    overlay.unmount();
    expect(held.result.current).toEqual({ display: false, rotation: false });
  });
});

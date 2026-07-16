// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { DisplayRule, Screen } from '@/types/config';
import { sharedStateStore } from '@/lib/shared-state-store';
import { useDisplayRules } from '../useDisplayRules';

/**
 * Integration of the rule engine with the real shared-state store through
 * the useDisplayRules hook: publishes must fire takeovers with no clock
 * tick, timers must release `for`-mode takeovers, and manual release must
 * win over a still-true condition. (Pure firing semantics — edges,
 * cooldown, priority — are covered in src/lib/__tests__/display-rules.test.ts.)
 */

const KEY = 'plugin:test-widget:doorbell';

function makeScreen(id: string, enabled?: boolean): Screen {
  return { id, name: id, backgroundImage: '', modules: [], ...(enabled === false ? { enabled } : {}) };
}

const screens = [makeScreen('home'), makeScreen('cameras'), makeScreen('hidden', false)];

function makeRule(overrides: Partial<DisplayRule> = {}): DisplayRule {
  return {
    id: 'doorbell',
    name: 'Doorbell',
    when: [{ kind: 'state', sourceKey: KEY, equals: 'on' }],
    action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 60 },
    ...overrides,
  };
}

describe('useDisplayRules', () => {
  beforeEach(() => {
    sharedStateStore.__resetForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('fires a takeover on a fresh publish edge and releases it at the for-deadline', () => {
    const rules = [makeRule()];
    const { result } = renderHook(() => useDisplayRules(rules, screens));
    expect(result.current.takeoverScreen).toBeNull();

    // Baseline publish (off) then the edge — fires with no timer advance.
    act(() => sharedStateStore.publish(KEY, 'off'));
    expect(result.current.takeoverScreen).toBeNull();
    act(() => sharedStateStore.publish(KEY, 'on'));
    expect(result.current.takeoverScreen?.id).toBe('cameras');

    // The deadline timer releases it and rotation resumes.
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(result.current.takeoverScreen).toBeNull();
  });

  it('does not fire for a condition already true at mount (boot safety)', () => {
    act(() => sharedStateStore.publish(KEY, 'on'));
    const rules = [makeRule()];
    const { result } = renderHook(() => useDisplayRules(rules, screens));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.takeoverScreen).toBeNull();
  });

  it('never resolves a disabled screen as the takeover target', () => {
    const rules = [makeRule({ action: { kind: 'showScreen', screenId: 'hidden', mode: 'for', seconds: 60 } })];
    const { result } = renderHook(() => useDisplayRules(rules, screens));
    act(() => sharedStateStore.publish(KEY, 'off'));
    act(() => sharedStateStore.publish(KEY, 'on'));
    expect(result.current.takeoverScreen).toBeNull();
  });

  it('releases a while-mode takeover when the condition clears, after the min hold', () => {
    const rules = [makeRule({ action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' } })];
    const { result } = renderHook(() => useDisplayRules(rules, screens));
    act(() => sharedStateStore.publish(KEY, 'off'));
    act(() => sharedStateStore.publish(KEY, 'on'));
    expect(result.current.takeoverScreen?.id).toBe('cameras');

    // Condition clears 2s in — inside the 5s min hold, still pinned.
    act(() => { vi.advanceTimersByTime(2_000); });
    act(() => sharedStateStore.publish(KEY, 'off'));
    expect(result.current.takeoverScreen?.id).toBe('cameras');

    // Min hold elapses — the deadline timer releases it.
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(result.current.takeoverScreen).toBeNull();
  });

  it('manual release wins and the rule does not reassert while still true', () => {
    const onWake = vi.fn();
    const rules = [makeRule({ action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' } })];
    const { result } = renderHook(() => useDisplayRules(rules, screens, onWake));
    act(() => sharedStateStore.publish(KEY, 'off'));
    act(() => sharedStateStore.publish(KEY, 'on'));
    expect(result.current.takeoverScreen?.id).toBe('cameras');

    act(() => result.current.releaseActiveTakeover());
    expect(result.current.takeoverScreen).toBeNull();

    // Condition unchanged (still true) — the rule must not reassert.
    act(() => { vi.advanceTimersByTime(60_000); });
    act(() => sharedStateStore.publish(KEY, 'on'));
    expect(result.current.takeoverScreen).toBeNull();

    // Fresh edge fires again.
    act(() => sharedStateStore.publish(KEY, 'off'));
    act(() => sharedStateStore.publish(KEY, 'on'));
    expect(result.current.takeoverScreen?.id).toBe('cameras');
  });

  it('invokes onWake for wake-action rules without taking over the render', () => {
    const onWake = vi.fn();
    const rules = [makeRule({ action: { kind: 'wake' } })];
    const { result } = renderHook(() => useDisplayRules(rules, screens, onWake));
    act(() => sharedStateStore.publish(KEY, 'off'));
    act(() => sharedStateStore.publish(KEY, 'on'));
    expect(onWake).toHaveBeenCalledTimes(1);
    expect(result.current.takeoverScreen).toBeNull();
  });

  it('handles no rules and undefined rules without subscribing', () => {
    const { result, rerender } = renderHook(
      ({ rules }: { rules?: DisplayRule[] }) => useDisplayRules(rules, screens),
      { initialProps: { rules: undefined as DisplayRule[] | undefined } },
    );
    expect(result.current.takeoverScreen).toBeNull();
    act(() => sharedStateStore.publish(KEY, 'on'));
    expect(result.current.takeoverScreen).toBeNull();
    rerender({ rules: [] });
    expect(result.current.takeoverScreen).toBeNull();
  });
});

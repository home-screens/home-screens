// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOptimisticMutation } from '@/hooks/useOptimisticMutation';

/**
 * The shared optimistic-mutation runner behind TodoModule and TodoistModule.
 * It owns exactly three things: apply-before-request, rollback-on-failure, and
 * per-key in-flight dedup. Regressions here surface as double requests on a
 * double-tap or an optimistic change that never reverts on a failed write.
 */

/** A promise plus its resolve/reject handles, for driving in-flight timing. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useOptimisticMutation', () => {
  it('applies optimistically, then does not roll back on success', async () => {
    const { result } = renderHook(() => useOptimisticMutation());
    const apply = vi.fn();
    const rollback = vi.fn();

    await act(async () => {
      await result.current.run('k', { apply, request: async () => {}, rollback });
    });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
    // Key is released once the request settles.
    expect(result.current.pending.current.has('k')).toBe(false);
  });

  it('rolls back with the thrown error when the request fails', async () => {
    const { result } = renderHook(() => useOptimisticMutation());
    const apply = vi.fn();
    const rollback = vi.fn();
    const boom = new Error('HTTP 500');

    await act(async () => {
      await result.current.run('k', {
        apply,
        request: async () => { throw boom; },
        rollback,
      });
    });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledWith(boom);
    expect(result.current.pending.current.has('k')).toBe(false);
  });

  it('ignores a repeat action for a key already in flight (dedup)', async () => {
    const { result } = renderHook(() => useOptimisticMutation());
    const apply = vi.fn();
    const first = deferred<void>();

    // First action stays in flight (request unresolved).
    let firstRun!: Promise<void>;
    act(() => {
      firstRun = result.current.run('k', { apply, request: () => first.promise, rollback: vi.fn() });
    });
    expect(result.current.pending.current.has('k')).toBe(true);

    // Second action for the same key while the first is pending: no-op.
    await act(async () => {
      await result.current.run('k', { apply, request: async () => {}, rollback: vi.fn() });
    });
    expect(apply).toHaveBeenCalledTimes(1);

    // Resolve the first; the key is released and a later action can proceed.
    await act(async () => { first.resolve(); await firstRun; });
    expect(result.current.pending.current.has('k')).toBe(false);

    await act(async () => {
      await result.current.run('k', { apply, request: async () => {}, rollback: vi.fn() });
    });
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('does not dedupe distinct keys', async () => {
    const { result } = renderHook(() => useOptimisticMutation());
    const applyA = vi.fn();
    const applyB = vi.fn();
    const a = deferred<void>();
    const b = deferred<void>();

    let runA!: Promise<void>;
    let runB!: Promise<void>;
    act(() => { runA = result.current.run('a', { apply: applyA, request: () => a.promise, rollback: vi.fn() }); });
    act(() => { runB = result.current.run('b', { apply: applyB, request: () => b.promise, rollback: vi.fn() }); });

    // Both keys are in flight concurrently.
    expect(applyA).toHaveBeenCalledTimes(1);
    expect(applyB).toHaveBeenCalledTimes(1);
    expect(result.current.pending.current.has('a')).toBe(true);
    expect(result.current.pending.current.has('b')).toBe(true);

    await act(async () => { a.resolve(); b.resolve(); await Promise.all([runA, runB]); });
    expect(result.current.pending.current.size).toBe(0);
  });
});

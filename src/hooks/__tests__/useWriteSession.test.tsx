// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const state = vi.hoisted(() => ({ expired: vi.fn((_e: unknown) => false) }));
vi.mock('@/lib/editor-fetch', () => ({ isSessionExpired: (e: unknown) => state.expired(e) }));

import { useWriteSession } from '../useWriteSession';

interface Row { id: string; text: string }
interface Req { kind: string }

function deferred<V>() {
  let resolve!: (v: V) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<V>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let visibility: DocumentVisibilityState = 'visible';

/** Let queued answers land under fake timers. */
async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  state.expired.mockReset().mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** `first` is what the read on mount answers, set before the hook can ask. */
function setup(first: Row[] | null, opts: { pollMs?: number } = {}) {
  const load = vi.fn<() => Promise<Row[] | null>>().mockResolvedValueOnce(first);
  const send = vi.fn<(req: Req) => Promise<{ data: Row[]; created?: { id: string } }>>();
  const onRefused = vi.fn();
  const onSaved = vi.fn();
  const view = renderHook(() => useWriteSession<Row[], Req, { id: string }>({
    initial: [],
    load,
    send,
    pollMs: opts.pollMs,
    onRefused,
    onSaved,
  }));
  return { view, load, send, onRefused, onSaved };
}

describe('useWriteSession', () => {
  it('reads on mount and exposes the copy, loaded and loadError', async () => {
    const { view, load } = setup([{ id: 'a', text: 'Milk' }]);
    expect(view.result.current.loaded).toBe(false);
    await act(async () => {});
    expect(view.result.current.loaded).toBe(true);
    expect(view.result.current.loadError).toBe(false);
    expect(view.result.current.data).toEqual([{ id: 'a', text: 'Milk' }]);
    // Read once without pollMs.
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('sets loadError on a failed read and clears it on retry', async () => {
    const { view, load } = setup(null);
    await act(async () => {});
    expect(view.result.current.loaded).toBe(false);
    expect(view.result.current.loadError).toBe(true);
    load.mockResolvedValueOnce([]);
    await act(async () => { view.result.current.retry(); });
    await settle();
    expect(view.result.current.loaded).toBe(true);
    expect(view.result.current.loadError).toBe(false);
  });

  it('polls while in view and pauses while hidden', async () => {
    const { load } = setup([], { pollMs: 5_000 });
    load.mockResolvedValue([]);
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(load).toHaveBeenCalledTimes(2);
    visibility = 'hidden';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(load).toHaveBeenCalledTimes(2);
    visibility = 'visible';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('shows a write at once, then the hub answer, and tells the surface it was saved', async () => {
    const { view, send, onSaved } = setup([{ id: 'a', text: 'Milk' }]);
    await act(async () => {});
    const answer = deferred<{ data: Row[]; created?: { id: string } }>();
    send.mockReturnValueOnce(answer.promise);
    let written!: Promise<Row[] | null>;
    act(() => {
      written = view.result.current.write(
        (rows) => [...rows, { id: 'tmp', text: 'Eggs' }],
        (r) => ({ kind: `add:${r('tmp')}` }),
        (created) => { if (created) view.result.current.mapId('tmp', created.id); },
      );
    });
    expect(view.result.current.data).toEqual([{ id: 'a', text: 'Milk' }, { id: 'tmp', text: 'Eggs' }]);
    await act(async () => {
      answer.resolve({ data: [{ id: 'a', text: 'Milk' }, { id: 'b', text: 'Eggs' }], created: { id: 'b' } });
      expect(await written).toEqual([{ id: 'a', text: 'Milk' }, { id: 'b', text: 'Eggs' }]);
    });
    expect(view.result.current.data).toEqual([{ id: 'a', text: 'Milk' }, { id: 'b', text: 'Eggs' }]);
    expect(view.result.current.resolveId('tmp')).toBe('b');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('reports a refusal, drops the change and reads the hub again', async () => {
    const { view, load, send, onRefused, onSaved } = setup([{ id: 'a', text: 'Milk' }]);
    await act(async () => {});
    send.mockRejectedValueOnce(new Error('No room'));
    load.mockResolvedValueOnce([{ id: 'a', text: 'Milk' }, { id: 'z', text: 'From elsewhere' }]);
    let written!: Promise<Row[] | null>;
    act(() => { written = view.result.current.write((rows) => [...rows, { id: 'tmp', text: 'Eggs' }], { kind: 'add' }); });
    expect(view.result.current.data).toHaveLength(2);
    await act(async () => { expect(await written).toBeNull(); });
    expect(onRefused).toHaveBeenCalledWith(expect.objectContaining({ message: 'No room' }));
    expect(onSaved).not.toHaveBeenCalled();
    await settle();
    expect(view.result.current.data).toEqual([{ id: 'a', text: 'Milk' }, { id: 'z', text: 'From elsewhere' }]);
  });

  it('says nothing for an expired session', async () => {
    const { view, load, send, onRefused } = setup([]);
    await act(async () => {});
    const expired = new Error('Session expired');
    state.expired.mockImplementation((e) => e === expired);
    send.mockRejectedValueOnce(expired);
    let written!: Promise<Row[] | null>;
    act(() => { written = view.result.current.write(null, { kind: 'add' }); });
    await act(async () => { expect(await written).toBeNull(); });
    expect(onRefused).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

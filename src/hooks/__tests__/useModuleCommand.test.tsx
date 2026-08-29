// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MODULE_COMMAND_EVENT, dispatchModuleCommand, useModuleCommand } from '@/hooks/useModuleCommand';

/**
 * The hub -> module command bus is a plain DOM event, so any mounted module
 * of a type can react to a `module-command` without knowing about the hub.
 * These tests pin the contract: matching by module type, the handler ref
 * staying current, and clean unsubscription on unmount / type change.
 */

describe('dispatchModuleCommand', () => {
  it('dispatches a CustomEvent carrying the command as detail', () => {
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(MODULE_COMMAND_EVENT, listener);

    dispatchModuleCommand({ module: 'news', action: 'next' });
    dispatchModuleCommand({ module: 'news', action: 'goto', value: 3 });

    window.removeEventListener(MODULE_COMMAND_EVENT, listener);
    expect(seen).toEqual([
      { module: 'news', action: 'next' },
      { module: 'news', action: 'goto', value: 3 },
    ]);
  });
});

describe('useModuleCommand', () => {
  it('calls the handler for commands addressed to its module type', () => {
    const handler = vi.fn();
    renderHook(() => useModuleCommand('news', handler));

    act(() => dispatchModuleCommand({ module: 'news', action: 'next' }));
    act(() => dispatchModuleCommand({ module: 'news', action: 'goto', value: 'story-2' }));

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, 'next', undefined);
    expect(handler).toHaveBeenNthCalledWith(2, 'goto', 'story-2');
  });

  it('ignores commands for other modules and malformed events', () => {
    const handler = vi.fn();
    renderHook(() => useModuleCommand('news', handler));

    act(() => dispatchModuleCommand({ module: 'clock', action: 'next' }));
    act(() => { window.dispatchEvent(new CustomEvent(MODULE_COMMAND_EVENT)); });
    act(() => { window.dispatchEvent(new Event(MODULE_COMMAND_EVENT)); });

    expect(handler).not.toHaveBeenCalled();
  });

  it('every mounted subscriber for the type receives the command', () => {
    const a = vi.fn();
    const b = vi.fn();
    renderHook(() => useModuleCommand('news', a));
    renderHook(() => useModuleCommand('news', b));

    act(() => dispatchModuleCommand({ module: 'news', action: 'prev' }));

    expect(a).toHaveBeenCalledWith('prev', undefined);
    expect(b).toHaveBeenCalledWith('prev', undefined);
  });

  it('always invokes the latest handler without resubscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { rerender } = renderHook(({ h }) => useModuleCommand('news', h), { initialProps: { h: first } });
    const subscriptions = () => addSpy.mock.calls.filter(([type]) => type === MODULE_COMMAND_EVENT).length;
    expect(subscriptions()).toBe(1);

    rerender({ h: second });
    act(() => dispatchModuleCommand({ module: 'news', action: 'next' }));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('next', undefined);
    expect(subscriptions()).toBe(1);
    addSpy.mockRestore();
  });

  it('stops listening on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useModuleCommand('news', handler));
    unmount();

    act(() => dispatchModuleCommand({ module: 'news', action: 'next' }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('follows a change of module type', () => {
    const handler = vi.fn();
    const { rerender } = renderHook(({ m }) => useModuleCommand(m, handler), { initialProps: { m: 'news' } });

    rerender({ m: 'fullscreen-news' });
    act(() => dispatchModuleCommand({ module: 'news', action: 'next' }));
    expect(handler).not.toHaveBeenCalled();

    act(() => dispatchModuleCommand({ module: 'fullscreen-news', action: 'next' }));
    expect(handler).toHaveBeenCalledWith('next', undefined);
  });
});

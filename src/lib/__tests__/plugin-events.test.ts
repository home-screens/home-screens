import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pluginEventBus } from '../plugin-events';

type PluginEvent = Parameters<typeof pluginEventBus.emit>[0];

describe('pluginEventBus', () => {
  let unsubs: (() => void)[];

  beforeEach(() => {
    unsubs = [];
  });

  afterEach(() => {
    // Clean up all subscriptions
    for (const unsub of unsubs) unsub();
  });

  function subscribe(handler: (event: PluginEvent) => void) {
    const unsub = pluginEventBus.on(handler);
    unsubs.push(unsub);
    return unsub;
  }

  // ---- Event validation ----

  it('drops null/undefined events', () => {
    const handler = vi.fn();
    subscribe(handler);
    pluginEventBus.emit(null as unknown as PluginEvent);
    pluginEventBus.emit(undefined as unknown as PluginEvent);
    expect(handler).not.toHaveBeenCalled();
  });

  it('drops events with non-string type', () => {
    const handler = vi.fn();
    subscribe(handler);
    pluginEventBus.emit({ type: 42 } as unknown as PluginEvent);
    pluginEventBus.emit({ type: true } as unknown as PluginEvent);
    expect(handler).not.toHaveBeenCalled();
  });

  it('drops events with unknown type strings', () => {
    const handler = vi.fn();
    subscribe(handler);
    pluginEventBus.emit({ type: 'destroy' } as unknown as PluginEvent);
    pluginEventBus.emit({ type: '' } as unknown as PluginEvent);
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts valid event types', () => {
    const handler = vi.fn();
    subscribe(handler);
    pluginEventBus.emit({ type: 'navigate', direction: 'next' });
    pluginEventBus.emit({ type: 'refresh' });
    pluginEventBus.emit({ type: 'log', level: 'info', message: 'test' });
    expect(handler).toHaveBeenCalledTimes(3);
  });

  // ---- Log routing ----

  it('routes log events to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    pluginEventBus.emit({ type: 'log', level: 'info', message: 'hello' });
    expect(spy).toHaveBeenCalledWith('[plugin]', 'hello');
    spy.mockRestore();
  });

  it('routes warn log events to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    pluginEventBus.emit({ type: 'log', level: 'warn', message: 'careful' });
    expect(spy).toHaveBeenCalledWith('[plugin]', 'careful');
    spy.mockRestore();
  });

  it('routes error log events to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    pluginEventBus.emit({ type: 'log', level: 'error', message: 'oops' });
    expect(spy).toHaveBeenCalledWith('[plugin]', 'oops');
    spy.mockRestore();
  });

  // ---- Handler fan-out and error isolation ----

  it('calls all handlers even if one throws', () => {
    const handler1 = vi.fn(() => { throw new Error('boom'); });
    const handler2 = vi.fn();
    subscribe(handler1);
    subscribe(handler2);
    pluginEventBus.emit({ type: 'refresh' });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('delivers the event object to handlers', () => {
    const handler = vi.fn();
    subscribe(handler);
    const event: PluginEvent = { type: 'navigate', direction: 'prev' };
    pluginEventBus.emit(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  // ---- Subscribe / unsubscribe lifecycle ----

  it('unsubscribe removes the handler', () => {
    const handler = vi.fn();
    const unsub = pluginEventBus.on(handler);
    pluginEventBus.emit({ type: 'refresh' });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    pluginEventBus.emit({ type: 'refresh' });
    expect(handler).toHaveBeenCalledTimes(1); // still 1 — not called again
  });

  it('double-unsubscribe is safe', () => {
    const handler = vi.fn();
    const unsub = pluginEventBus.on(handler);
    unsub();
    unsub(); // no-op, should not throw
    pluginEventBus.emit({ type: 'refresh' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('same function subscribed twice is deduplicated (Set semantics)', () => {
    const handler = vi.fn();
    subscribe(handler);
    subscribe(handler);
    pluginEventBus.emit({ type: 'refresh' });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

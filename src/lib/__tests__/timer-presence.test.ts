import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getShowingTimerSession,
  setShowingTimerSession,
  subscribeTimerPresence,
  __resetTimerPresenceForTests,
} from '@/lib/timer-presence';

describe('timer-presence', () => {
  beforeEach(() => __resetTimerPresenceForTests());

  it('starts with nothing showing', () => {
    expect(getShowingTimerSession()).toBeNull();
  });

  it('notifies subscribers only when the showing session actually changes', () => {
    const fn = vi.fn();
    subscribeTimerPresence(fn);
    setShowingTimerSession('sess-1');
    setShowingTimerSession('sess-1');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getShowingTimerSession()).toBe('sess-1');
    setShowingTimerSession(null);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(getShowingTimerSession()).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const fn = vi.fn();
    const off = subscribeTimerPresence(fn);
    off();
    setShowingTimerSession('sess-2');
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('a Quick Timer box drawing a timer in place', () => {
  beforeEach(() => __resetTimerPresenceForTests());

  it('counts as showing it, for as long as some box draws it', async () => {
    const { getBoxTimerSession, setBoxTimerSession } = await import('@/lib/timer-presence');
    const fn = vi.fn();
    subscribeTimerPresence(fn);
    const a = {};
    const b = {};
    setBoxTimerSession(a, 'sess-1');
    setBoxTimerSession(b, 'sess-1');
    setBoxTimerSession(a, 'sess-1');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(getShowingTimerSession()).toBe('sess-1');

    setBoxTimerSession(a, null);
    expect(getBoxTimerSession()).toBe('sess-1');
    setBoxTimerSession(b, null);
    expect(getBoxTimerSession()).toBeNull();
    expect(getShowingTimerSession()).toBeNull();
  });

  it('gives way to the takeover when both are up', async () => {
    const { setBoxTimerSession } = await import('@/lib/timer-presence');
    setBoxTimerSession({}, 'boxed');
    setShowingTimerSession('covering');
    expect(getShowingTimerSession()).toBe('covering');
  });
});

describe('requestTimerRefresh', () => {
  beforeEach(() => __resetTimerPresenceForTests());

  it('reaches every listener until it unsubscribes', async () => {
    const { requestTimerRefresh, subscribeTimerRefresh } = await import('@/lib/timer-presence');
    const fn = vi.fn();
    const off = subscribeTimerRefresh(fn);
    requestTimerRefresh();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    requestTimerRefresh();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

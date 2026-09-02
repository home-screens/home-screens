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

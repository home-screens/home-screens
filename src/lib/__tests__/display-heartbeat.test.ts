import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  followedRevision, hubSilentSince, isGatewayFailure, noteBeatOutcome, publishRevisions, subscribeHubReach, subscribeRevisions,
  __resetHeartbeatForTests,
} from '@/lib/display-heartbeat';

beforeEach(() => {
  vi.useFakeTimers();
  __resetHeartbeatForTests();
});
afterEach(() => vi.useRealTimers());

describe('followedRevision', () => {
  it('names the latest beat’s revision for the chores and rewards reads, whatever the query', () => {
    publishRevisions({ chores: '"c1"', rewards: '"w1"' });
    expect(followedRevision('/api/chores?days=31')).toBe('"c1"');
    expect(followedRevision('/api/chores')).toBe('"c1"');
    expect(followedRevision('/api/rewards')).toBe('"w1"');
  });

  it('names nothing for reads the heartbeat does not report on', () => {
    publishRevisions({ chores: '"c1"', rewards: '"w1"' });
    expect(followedRevision('/api/chores/data')).toBeUndefined();
    expect(followedRevision('/api/rewards/data')).toBeUndefined();
    expect(followedRevision('/api/family')).toBeUndefined();
  });

  it('names nothing on a page that takes no heartbeat', () => {
    expect(followedRevision('/api/chores?days=31')).toBeUndefined();
  });

  it('names nothing once a beat leaves the field out', () => {
    publishRevisions({ chores: '"c1"' });
    publishRevisions({ buildId: 'b1' });
    expect(followedRevision('/api/chores?days=31')).toBeUndefined();
  });

  it('stops trusting the last beat after three missed ones', () => {
    publishRevisions({ chores: '"c1"' });
    vi.advanceTimersByTime(10_000);
    expect(followedRevision('/api/chores')).toBe('"c1"');
    vi.advanceTimersByTime(1);
    expect(followedRevision('/api/chores')).toBeUndefined();
  });

  it('is up to date inside a listener, so a fetch it starts records this beat', () => {
    publishRevisions({ chores: '"c1"' });
    const seen: Array<string | undefined> = [];
    const unsubscribe = subscribeRevisions(() => seen.push(followedRevision('/api/chores')));
    publishRevisions({ chores: '"c2"' });
    unsubscribe();
    expect(seen).toEqual(['"c2"']);
  });
});

describe('hub reach', () => {
  it('reads the hub as answering until a beat goes unanswered', () => {
    expect(hubSilentSince()).toBeNull();
    noteBeatOutcome(true, 1_000);
    expect(hubSilentSince()).toBeNull();
    noteBeatOutcome(false, 4_000);
    // Since the last answer, not since the first miss.
    expect(hubSilentSince()).toBe(1_000);
    noteBeatOutcome(false, 7_000);
    expect(hubSilentSince()).toBe(1_000);
  });

  it('clears on the next answer', () => {
    noteBeatOutcome(false, 4_000);
    noteBeatOutcome(true, 9_000);
    expect(hubSilentSince()).toBeNull();
  });

  it('tells listeners only when the hub starts or stops answering', () => {
    const listener = vi.fn();
    const off = subscribeHubReach(listener);
    noteBeatOutcome(true);
    expect(listener).not.toHaveBeenCalled();
    noteBeatOutcome(false);
    noteBeatOutcome(false);
    expect(listener).toHaveBeenCalledTimes(1);
    noteBeatOutcome(true);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    noteBeatOutcome(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('counts a proxy saying the hub is gone as no answer, and a refusal as an answer', () => {
    expect(isGatewayFailure(502)).toBe(true);
    expect(isGatewayFailure(503)).toBe(true);
    expect(isGatewayFailure(504)).toBe(true);
    expect(isGatewayFailure(401)).toBe(false);
    expect(isGatewayFailure(500)).toBe(false);
    expect(isGatewayFailure(200)).toBe(false);
  });
});

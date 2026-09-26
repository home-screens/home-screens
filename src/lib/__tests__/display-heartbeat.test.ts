import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followedRevision, publishRevisions, subscribeRevisions, __resetHeartbeatForTests } from '@/lib/display-heartbeat';

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

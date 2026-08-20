import { describe, it, expect } from 'vitest';
import { mergeSourceStatus } from '@/lib/calendar-source-status';

describe('mergeSourceStatus', () => {
  it('stamps now on successes and records them as last-good', () => {
    const lastGood = new Map<string, number>();
    const out = mergeSourceStatus([{ id: 'a', name: 'A', ok: true }], lastGood, 1000);
    expect(out).toEqual([{ id: 'a', name: 'A', ok: true, fetchedAt: 1000 }]);
    expect(lastGood.get('a')).toBe(1000);
  });

  it('reports a failing source with its last success time', () => {
    const lastGood = new Map<string, number>();
    mergeSourceStatus([{ id: 'a', ok: true }], lastGood, 1000);
    const out = mergeSourceStatus([{ id: 'a', ok: false, error: 'Could not reach the link' }], lastGood, 2000);
    expect(out).toEqual([{ id: 'a', ok: false, error: 'Could not reach the link', fetchedAt: 1000 }]);
    // A failure never overwrites the last-good stamp.
    expect(lastGood.get('a')).toBe(1000);
  });

  it('reports null fetchedAt for a source that has never succeeded', () => {
    const out = mergeSourceStatus([{ id: 'new', ok: false, error: 'nope' }], new Map(), 500);
    expect(out[0].fetchedAt).toBeNull();
  });

  it('a later success replaces the stamp and clears the failure state', () => {
    const lastGood = new Map<string, number>([['a', 1000]]);
    const out = mergeSourceStatus([{ id: 'a', ok: true }], lastGood, 3000);
    expect(out[0]).toEqual({ id: 'a', ok: true, fetchedAt: 3000 });
    expect(lastGood.get('a')).toBe(3000);
  });
});

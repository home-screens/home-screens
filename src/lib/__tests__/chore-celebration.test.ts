import { describe, it, expect } from 'vitest';
import { detectDayComplete } from '../chore-celebration';

const counts = (entries: Record<string, [completed: number, total: number]>) =>
  new Map(Object.entries(entries).map(([id, [completed, total]]) => [id, { completed, total }]));

describe('detectDayComplete', () => {
  it('names the person whose last chore was just ticked', () => {
    expect(detectDayComplete(counts({ a: [2, 3], b: [1, 2] }), counts({ a: [3, 3], b: [1, 2] }))).toEqual(['a']);
  });

  it('names everyone who finished in the same beat, in the new snapshot\'s order', () => {
    expect(detectDayComplete(counts({ a: [2, 3], b: [1, 2] }), counts({ b: [2, 2], a: [3, 3] }))).toEqual(['b', 'a']);
  });

  it('celebrates nothing on the first snapshot, however finished it looks', () => {
    expect(detectDayComplete(null, counts({ a: [3, 3] }))).toEqual([]);
  });

  it('celebrates nobody who was already finished', () => {
    expect(detectDayComplete(counts({ a: [3, 3] }), counts({ a: [3, 3] }))).toEqual([]);
  });

  it('ignores a day that became complete because a chore was taken away', () => {
    expect(detectDayComplete(counts({ a: [2, 3] }), counts({ a: [2, 2] }))).toEqual([]);
  });

  it('ignores a day with nothing owed, and someone new to the chart', () => {
    expect(detectDayComplete(counts({ a: [0, 0] }), counts({ a: [0, 0] }))).toEqual([]);
    // Appearing already complete is like the first snapshot for that person.
    expect(detectDayComplete(counts({ a: [1, 2] }), counts({ a: [1, 2], b: [2, 2] }))).toEqual(['b']);
  });

  it('celebrates again after an un-tick and a re-tick', () => {
    const done = counts({ a: [3, 3] });
    const undone = counts({ a: [2, 3] });
    expect(detectDayComplete(done, undone)).toEqual([]);
    expect(detectDayComplete(undone, done)).toEqual(['a']);
  });
});

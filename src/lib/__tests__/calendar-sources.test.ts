import { describe, it, expect } from 'vitest';
import { insertInListOrder } from '@/lib/calendar-sources';

describe('insertInListOrder', () => {
  const listed = ['a', 'b', 'c', 'd'];
  const rank = (id: string) => listed.indexOf(id);

  it('puts a calendar ticked again back in its place in the list', () => {
    expect(insertInListOrder(['a', 'c', 'd'], 'b', rank)).toEqual(['a', 'b', 'c', 'd']);
    expect(insertInListOrder(['b', 'c'], 'a', rank)).toEqual(['a', 'b', 'c']);
    expect(insertInListOrder(['a', 'b'], 'd', rank)).toEqual(['a', 'b', 'd']);
  });

  it('keeps the order already there, and adds one the list does not hold at the end', () => {
    expect(insertInListOrder(['d', 'a'], 'b', rank)).toEqual(['b', 'd', 'a']);
    expect(insertInListOrder(['a', 'x'], 'c', rank)).toEqual(['a', 'x', 'c']);
    expect(insertInListOrder(['a', 'b'], 'zz', rank)).toEqual(['a', 'b', 'zz']);
  });
});

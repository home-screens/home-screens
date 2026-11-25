import { describe, it, expect } from 'vitest';
import { wallsLetInByThemselves, type WallApiEntry } from '../walls-api-types';

function wall(over: Partial<WallApiEntry>): WallApiEntry {
  return {
    id: 'w',
    status: 'in',
    displayId: null,
    address: '192.168.1.50',
    userAgent: 'Chromium',
    viewport: null,
    lastSeenAt: 0,
    createdAt: 0,
    letInByItself: false,
    hubScreen: false,
    looksFamiliar: false,
    ...over,
  };
}

describe('wallsLetInByThemselves', () => {
  it('keeps the walls that are in and were let in by themselves', () => {
    const walls = [
      wall({ id: 'a', letInByItself: true }),
      wall({ id: 'b' }),
      wall({ id: 'c', letInByItself: true, displayId: 'kitchen' }),
      wall({ id: 'd', hubScreen: true }),
    ];
    expect(wallsLetInByThemselves(walls).map((w) => w.id)).toEqual(['a', 'c']);
  });

  it('never counts a wall that is still waiting', () => {
    expect(wallsLetInByThemselves([wall({ status: 'waiting', letInByItself: true })])).toEqual([]);
  });

  it('is empty when there are no walls', () => {
    expect(wallsLetInByThemselves([])).toEqual([]);
  });
});

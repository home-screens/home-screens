import { describe, it, expect } from 'vitest';
import { gameStatusLabel } from '../shared';

const words = { final: 'Endstand', inProgress: 'Läuft' };

describe('gameStatusLabel', () => {
  it('shows the kickoff for a game that has not started, or the status word without one', () => {
    expect(gameStatusLabel({ state: 'pre', status: 'Scheduled', detail: 'Sun, September 13th at 1:00 PM EDT' }, 'Today · 7:20 PM', words)).toBe('Today · 7:20 PM');
    expect(gameStatusLabel({ state: 'pre', status: 'Scheduled' }, null, words)).toBe('Scheduled');
  });

  it('shows the clock and period of a game in progress, not the bare status word', () => {
    expect(gameStatusLabel({ state: 'in', status: 'In Progress', detail: '4:12 - 3rd' }, null, words)).toBe('4:12 - 3rd');
  });

  it('falls back to the status word, in the hub language when it is the plain one', () => {
    expect(gameStatusLabel({ state: 'in', status: 'Halftime', detail: '' }, null, words)).toBe('Halftime');
    expect(gameStatusLabel({ state: 'in', status: 'In Progress', detail: '' }, null, words)).toBe('Läuft');
  });

  it('says Final in the hub language and keeps the overtime suffix', () => {
    expect(gameStatusLabel({ state: 'post', status: 'Final', detail: 'Final' }, null, words)).toBe('Endstand');
    expect(gameStatusLabel({ state: 'post', status: 'Final', detail: 'Final/OT' }, null, words)).toBe('Endstand/OT');
    expect(gameStatusLabel({ state: 'post', status: 'Final', detail: '' }, null, words)).toBe('Endstand');
  });

  it('keeps any other ending as the source words it', () => {
    expect(gameStatusLabel({ state: 'post', status: 'Postponed', detail: 'Postponed' }, null, words)).toBe('Postponed');
  });
});

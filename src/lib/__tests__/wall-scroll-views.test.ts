import { describe, expect, it } from 'vitest';
import { homeShowingRow, wallScrollOn } from '../wall-scroll-views';

describe('wallScrollOn', () => {
  it('scrolls on a real display with taps on', () => {
    expect(wallScrollOn(true, 's1', 'mod1')).toBe(true);
  });

  it('never scrolls with taps off', () => {
    expect(wallScrollOn(false, 's1', 'mod1')).toBe(false);
  });

  it('never scrolls in the editor preview, which has no screen or module id', () => {
    expect(wallScrollOn(true, undefined, undefined)).toBe(false);
    expect(wallScrollOn(true, 's1', undefined)).toBe(false);
    expect(wallScrollOn(true, undefined, 'mod1')).toBe(false);
  });
});

describe('homeShowingRow', () => {
  it('stays at the top when nothing scrolls', () => {
    expect(homeShowingRow(300, 340, 200, 0)).toBe(0);
  });

  it('stays at the top while the row shows from there', () => {
    expect(homeShowingRow(150, 200, 200, 120)).toBe(0);
  });

  it('brings a row cut off at the bottom to the top', () => {
    expect(homeShowingRow(150, 201, 200, 400)).toBe(150);
  });

  it('stops at the end of the list when the row is near the bottom', () => {
    expect(homeShowingRow(380, 420, 200, 220)).toBe(220);
  });
});

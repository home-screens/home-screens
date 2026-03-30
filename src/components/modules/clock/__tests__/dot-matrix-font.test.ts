import { describe, it, expect } from 'vitest';
import { isDotActive, DOT_COLS, DOT_ROWS } from '../dot-matrix-font';

describe('isDotActive', () => {
  it('returns false for an unrecognised character', () => {
    expect(isDotActive('Z', 0, 0)).toBe(false);
    expect(isDotActive('', 0, 0)).toBe(false);
  });

  it('digit "1" has the expected top-center pattern', () => {
    // Row 0 of "1" is 0b00100 → only col 2 is active
    expect(isDotActive('1', 0, 0)).toBe(false);
    expect(isDotActive('1', 0, 1)).toBe(false);
    expect(isDotActive('1', 0, 2)).toBe(true);
    expect(isDotActive('1', 0, 3)).toBe(false);
    expect(isDotActive('1', 0, 4)).toBe(false);
  });

  it('digit "0" has lit edges and a dark centre on row 0', () => {
    // Row 0 of "0" is 0b01110 → cols 1,2,3 active
    expect(isDotActive('0', 0, 0)).toBe(false);
    expect(isDotActive('0', 0, 1)).toBe(true);
    expect(isDotActive('0', 0, 2)).toBe(true);
    expect(isDotActive('0', 0, 3)).toBe(true);
    expect(isDotActive('0', 0, 4)).toBe(false);
  });

  it('bottom row of "8" is 0b01110 (rounded base)', () => {
    expect(isDotActive('8', 6, 0)).toBe(false);
    expect(isDotActive('8', 6, 1)).toBe(true);
    expect(isDotActive('8', 6, 2)).toBe(true);
    expect(isDotActive('8', 6, 3)).toBe(true);
    expect(isDotActive('8', 6, 4)).toBe(false);
  });

  it('colon has dots only in rows 1-2 and 4-5, col 2', () => {
    // Pattern: rows 0,3,6 are empty; rows 1,2 and 4,5 have col 2 lit
    const litRows = new Set([1, 2, 4, 5]);
    for (let r = 0; r < DOT_ROWS; r++) {
      for (let c = 0; c < DOT_COLS; c++) {
        const expected = litRows.has(r) && c === 2;
        expect(isDotActive(':', r, c)).toBe(expected);
      }
    }
  });

  it('all 10 digits are recognised (no false for every dot)', () => {
    for (let d = 0; d <= 9; d++) {
      let anyActive = false;
      for (let r = 0; r < DOT_ROWS; r++) {
        for (let c = 0; c < DOT_COLS; c++) {
          if (isDotActive(String(d), r, c)) anyActive = true;
        }
      }
      expect(anyActive, `digit ${d} should have at least one active dot`).toBe(true);
    }
  });

  it('stays within bounds (no crash on edge indices)', () => {
    expect(() => isDotActive('0', 0, 0)).not.toThrow();
    expect(() => isDotActive('0', DOT_ROWS - 1, DOT_COLS - 1)).not.toThrow();
  });
});

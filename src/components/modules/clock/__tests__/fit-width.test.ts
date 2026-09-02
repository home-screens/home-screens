import { describe, it, expect } from 'vitest';
import {
  estimateTextWidth,
  fitFactor,
  timeLineWidth,
  flipRowWidth,
  digitalRowWidth,
  splitRowWidth,
  DIGIT_EM,
  COLON_EM,
  SPACE_EM,
  UPPER_EM,
  FIT_INSET_PX,
  MIN_FIT_FACTOR,
} from '../fit-width';

describe('estimateTextWidth', () => {
  it('sums glyph classes at the font size', () => {
    // 5 digits, 2 colons at 100px
    expect(estimateTextWidth('9:51:37', 100)).toBeCloseTo((5 * DIGIT_EM + 2 * COLON_EM) * 100);
  });

  it('adds letter spacing per glyph', () => {
    const plain = estimateTextWidth('12:34', 50);
    expect(estimateTextWidth('12:34', 50, 0.1)).toBeCloseTo(plain + 5 * 0.1 * 50);
  });

  it('treats a space and uppercase letters as their own classes', () => {
    expect(estimateTextWidth(' PM', 10)).toBeCloseTo((SPACE_EM + 2 * UPPER_EM) * 10);
  });

  it('is zero for an empty string', () => {
    expect(estimateTextWidth('', 40)).toBe(0);
  });
});

describe('fitFactor', () => {
  it('is 1 when the content fits with the inset to spare', () => {
    expect(fitFactor(300, 400)).toBe(1);
    expect(fitFactor(376, 400)).toBe(1);
  });

  it('is 1 before the box has been measured', () => {
    expect(fitFactor(500, 0)).toBe(1);
  });

  it('shrinks so the content lands inside the inset', () => {
    const factor = fitFactor(500, 400);
    expect(factor).toBeCloseTo((400 - FIT_INSET_PX) / 500);
    expect(500 * factor).toBeLessThanOrEqual(400 - FIT_INSET_PX);
  });

  it('never grows past the base size when the box widens', () => {
    expect(fitFactor(200, 2000)).toBe(1);
  });

  it('honours a custom inset', () => {
    expect(fitFactor(500, 400, 48)).toBeCloseTo((400 - 48) / 500);
  });

  it('floors at the minimum factor for an absurdly narrow box', () => {
    expect(fitFactor(1000, 30)).toBe(MIN_FIT_FACTOR);
    expect(fitFactor(1000, 10)).toBe(MIN_FIT_FACTOR);
  });
});

describe('timeLineWidth', () => {
  it('is the bare time when there is no suffix', () => {
    expect(timeLineWidth('12:34', 60, 0)).toBeCloseTo(estimateTextWidth('12:34', 60));
    expect(timeLineWidth('12:34', 60, 0, null)).toBeCloseTo(estimateTextWidth('12:34', 60));
  });

  it('adds the AM/PM suffix at its own size, with its leading space and margin', () => {
    const base = estimateTextWidth('9:51:37', 100, 0.025);
    const suffixSize = 40;
    const expected = base + estimateTextWidth(' PM', suffixSize, 0.025) + 0.15 * suffixSize;
    expect(timeLineWidth('9:51:37', 100, 0.025, { text: 'PM', scale: 0.4, marginEm: 0.15 })).toBeCloseTo(expected);
  });

  it('fits the audit case: "9:51:37 PM" inside a 330px box', () => {
    // Classic at the 280px-tall audit box: scaledFontSize 33.6, time 3x.
    const timeFont = 33.6 * 3;
    const width = timeLineWidth('9:51:37', timeFont, 0.025, { text: 'PM', scale: 0.4, marginEm: 0.15 });
    expect(width).toBeGreaterThan(330);
    const factor = fitFactor(width, 330);
    expect(factor).toBeLessThan(1);
    expect(width * factor).toBeLessThanOrEqual(330 - FIT_INSET_PX);
    // Still legible: well above the floor.
    expect(timeFont * factor).toBeGreaterThan(50);
  });
});

describe('flipRowWidth', () => {
  it('sums cards, colons and the gaps between them', () => {
    // 4 cards of 65, one colon of 20, four gaps of 4 at size 100
    expect(flipRowWidth(100, 4, 1)).toBeCloseTo(4 * 65 + 20 + 4 * 4);
  });

  it('adds two cards and a colon for seconds', () => {
    expect(flipRowWidth(100, 6, 2)).toBeCloseTo(6 * 65 + 2 * 20 + 7 * 4);
  });

  it('keeps the minimum gap on tiny cards', () => {
    expect(flipRowWidth(20, 4, 1)).toBeCloseTo(4 * 13 + 4 + 4 * 2);
  });
});

describe('digitalRowWidth', () => {
  it('sums seven-segment digits, colons and the 4px flex gaps', () => {
    // 6 digits of 60, 2 colons of 25, 7 gaps of 4 at size 100
    expect(digitalRowWidth(100, 6, 2)).toBeCloseTo(6 * 60 + 2 * 25 + 7 * 4);
    expect(digitalRowWidth(100, 4, 1)).toBeCloseTo(4 * 60 + 25 + 4 * 4);
  });
});

describe('splitRowWidth', () => {
  const time = { text: '9:51:37', fontSize: 84, letterSpacingEm: 0.025 };

  it('is time, gap and divider when there is no date column', () => {
    expect(splitRowWidth(time, 42, [])).toBeCloseTo(estimateTextWidth('9:51:37', 84, 0.025) + 42 + 1);
  });

  it('adds a second gap and the widest date line', () => {
    const lines = [
      { text: 'Monday, August 31', fontSize: 30 },
      { text: 'WK 36', fontSize: 24, letterSpacingEm: 0.025 },
    ];
    const widest = Math.max(estimateTextWidth(lines[0].text, 30), estimateTextWidth(lines[1].text, 24, 0.025));
    expect(splitRowWidth(time, 42, lines)).toBeCloseTo(estimateTextWidth('9:51:37', 84, 0.025) + 42 + 1 + 42 + widest);
  });
});

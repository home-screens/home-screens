import { describe, expect, it } from 'vitest';
import { weekCellLayout, weekCellPieces, weekCellWords, type WeekCellRoom } from '../meal-week-cell';

/**
 * A 400x660 module with four meals a day at 16px: 80.5px cells, 66.5px inside
 * their padding, and rows tall enough for a picture over two lines of name
 * and the serving time under them. "7:30 AM" at 11px is about 46px.
 */
const NARROW: WeekCellRoom = {
  cellPx: 66.5,
  rowPx: 80,
  namePx: 13,
  nameChars: 'Oatmeal pancakes'.length,
  longestWordChars: 'pancakes'.length,
  picturePx: 19.2,
  timePx: 46,
  countPx: 0,
  smallLinePx: 16,
};

describe('weekCellLayout', () => {
  it('gives the name the whole cell and puts the time under it', () => {
    // Beside the name, "7:30 AM" left it 16px and cut "Oatmeal" to "Oa / t...".
    expect(weekCellLayout(NARROW)).toMatchObject({ pictureAbove: true, nameLines: 2, showTime: true, countAt: null });
    // About nine letters to a line: "Vietnamese" cannot fit whole.
    expect(Math.floor(weekCellLayout(NARROW).lineChars)).toBe(9);
  });

  it('leaves the picture beside the name in a cell with room for both', () => {
    expect(weekCellLayout({ ...NARROW, cellPx: 140 }).pictureAbove).toBe(false);
  });

  it('has nothing to move when there is no picture', () => {
    expect(weekCellLayout({ ...NARROW, picturePx: 0 })).toMatchObject({ pictureAbove: false, showTime: true });
  });

  it('moves the picture above a word that would not fit beside it, when the time still fits', () => {
    // A 500px module: 100px cells leave 77px beside the picture, and
    // "Cheeseburgers" needs about 93.
    const roomy = { ...NARROW, cellPx: 100, nameChars: 13, longestWordChars: 13 };
    expect(weekCellLayout(roomy)).toMatchObject({ pictureAbove: true, showTime: true });
    expect(weekCellLayout({ ...roomy, longestWordChars: 8 }).pictureAbove).toBe(false);
    // Stacked, the time would no longer fit: the picture stays beside.
    expect(weekCellLayout({ ...roomy, rowPx: 64 })).toMatchObject({ pictureAbove: false, showTime: true });
  });

  it('keeps the picture beside the name in a row too short to stack them', () => {
    // A picture over two lines of name is about 55px here, and a 400x300
    // module gives each day under 40: stacked, the cell would spill into the
    // next day's row.
    expect(weekCellLayout({ ...NARROW, rowPx: 34 }).pictureAbove).toBe(false);
  });

  it('drops the time first when the row has no height for it', () => {
    // Picture, two lines of name and the gaps take 54.4px; the time needs 18 more.
    expect(weekCellLayout({ ...NARROW, rowPx: 64 })).toMatchObject({ pictureAbove: true, nameLines: 2, showTime: false });
  });

  it('keeps the time under a short name that leaves its second line free', () => {
    const squat = { ...NARROW, picturePx: 0, rowPx: 34 };
    expect(weekCellLayout({ ...squat, nameChars: 'Tacos'.length }).showTime).toBe(true);
    expect(weekCellLayout(squat).showTime).toBe(false);
  });

  it('gives up the second line of name only in a row too short for two', () => {
    expect(weekCellLayout({ ...NARROW, picturePx: 0, rowPx: 30 }).nameLines).toBe(1);
    expect(weekCellLayout({ ...NARROW, picturePx: 0, rowPx: 32 }).nameLines).toBe(2);
  });

  it('leaves the time off rather than cut it in a cell narrower than it', () => {
    expect(weekCellLayout({ ...NARROW, cellPx: 40 }).showTime).toBe(false);
  });

  it('puts the course count beside a picture above the name', () => {
    expect(weekCellLayout({ ...NARROW, countPx: 20 }).countAt).toBe('picture');
  });

  it('puts the course count on the time\'s line when the picture is beside the name or there is none', () => {
    expect(weekCellLayout({ ...NARROW, picturePx: 0, countPx: 20 })).toMatchObject({ showTime: true, countAt: 'line' });
    expect(weekCellLayout({ ...NARROW, picturePx: 0, timePx: 0, countPx: 20 })).toMatchObject({ showTime: false, countAt: 'line' });
  });

  it('wraps the count under the time in a cell too narrow for both side by side', () => {
    // "7:30 AM" and "+2" need about 70px together, the cell has 66.5.
    const plain = { ...NARROW, picturePx: 0, nameChars: 'Leftovers'.length, countPx: 20 };
    expect(weekCellLayout(plain)).toMatchObject({ showTime: true, countAt: 'line' });
    // With height for one small line only, the count stays and the time gives way.
    expect(weekCellLayout({ ...plain, rowPx: 64 })).toMatchObject({ showTime: false, countAt: 'line' });
  });

  it('keeps the course count after the name when the line under it has no room', () => {
    expect(weekCellLayout({ ...NARROW, picturePx: 0, rowPx: 34, countPx: 20 })).toMatchObject({ showTime: false, countAt: 'name' });
  });

  it('keeps the authored layout until the view has been measured', () => {
    expect(weekCellLayout({ ...NARROW, cellPx: 0, countPx: 20 })).toEqual({ pictureAbove: false, nameLines: 2, lineChars: Infinity, showTime: true, countAt: 'line' });
  });
});

describe('weekCellWords', () => {
  it('breaks a name at its spaces only', () => {
    expect(weekCellWords('Acaraje black-eyed  fritters')).toEqual(['Acaraje', 'black-eyed', 'fritters']);
    expect(weekCellWords('')).toEqual([]);
  });

  it('keeps a spaced dash with the word before it', () => {
    expect(weekCellWords('Rømmegrøt – Norwegian Porridge')).toEqual(['Rømmegrøt\u00a0–', 'Norwegian', 'Porridge']);
    expect(weekCellWords('Chili - mild')).toEqual(['Chili\u00a0-', 'mild']);
  });
});

describe('weekCellPieces', () => {
  it('keeps the words that fit as one run of text and boxes each one clearly too long', () => {
    const words = weekCellWords('Vietnamese pork noodle salad');
    expect(weekCellPieces(words, 8)).toEqual([
      { text: 'Vietnamese', box: true },
      { text: ' pork noodle salad', box: false },
    ]);
    // A word about a line long stays plain: boxed and fitting after all, it
    // left the clamp's ellipsis no room ("Enchiladas..").
    expect(weekCellPieces(weekCellWords('Chicken Enchiladas with Salsa Verde'), 9.5)).toEqual([
      { text: 'Chicken Enchiladas with Salsa Verde', box: false },
    ]);
  });

  it('leaves the space before a boxed word outside it, where the line can break', () => {
    expect(weekCellPieces(['Big', 'Cheeseburgers', 'today'], 8)).toEqual([
      { text: 'Big ', box: false },
      { text: 'Cheeseburgers', box: true },
      { text: ' today', box: false },
    ]);
    expect(weekCellPieces(['Cheeseburgers', 'Rømmegrøt\u00a0–'], 8)).toEqual([
      { text: 'Cheeseburgers', box: true },
      { text: ' ', box: false },
      { text: 'Rømmegrøt\u00a0–', box: true },
    ]);
  });
});

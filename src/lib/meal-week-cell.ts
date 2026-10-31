/**
 * How a Meal Planner week cell lays out a dish: where its picture goes, how
 * many lines its name may take, and whether its serving time and course count
 * still fit under it.
 *
 * The name comes first. A 400px module with four meals a day leaves cells
 * about 66px wide, and everything set beside the name came off that width:
 * the serving time took half of it and cut "Oatmeal" to "Oa / t...", and the
 * picture beside it broke "Pancakes" into "Pancak / es". So the time goes on
 * its own line under the name, the picture moves above a name it would
 * squeeze to under about seven letters, and the name breaks between words
 * only, ending in an ellipsis when it still does not fit. What the row has no
 * height for gives way in turn: the time first, then the name's second line.
 */

/** The fewest letters of a dish name the line beside its picture has to hold. */
const NAME_MIN_CHARS = 7;
/** An average letter of a dish name, in em of its size. */
const NAME_CHAR_EM = 0.55;
/** The most lines a name wraps to before it ends in an ellipsis. */
const NAME_MAX_LINES = 2;
/** The line height the view draws names at. */
const NAME_LINE_HEIGHT = 1.2;
/**
 * A name breaks between words, so a line holds less than the width allows; a
 * name only counts on one line when its letters leave this much slack.
 */
const ONE_LINE_FILL = 0.85;
/**
 * The gap a cell draws between its pieces: the picture and the name, either
 * way round, and the time and the count on the line under the name.
 */
export const WEEK_GAP_PX = 4;
/** The gap between the name and the line under it. */
export const WEEK_LINE_GAP_PX = 2;

export interface WeekCellRoom {
  /** The cell's width inside its padding. Zero until the view has been measured. */
  cellPx: number;
  /** The cell's height inside its padding. */
  rowPx: number;
  /** The dish name's type size. */
  namePx: number;
  /** The dish name's length in letters. */
  nameChars: number;
  /** Its longest word's (see `weekCellWords`), the most a line has to hold in one piece. */
  longestWordChars: number;
  /** The picture's box: its width beside the name, its line above it. Zero for none. */
  picturePx: number;
  /** The serving time's width. Zero when the meal has no time. */
  timePx: number;
  /** The course count's width. Zero for a meal without courses. */
  countPx: number;
  /** The height of the small line under the name that holds the time and the count. */
  smallLinePx: number;
}

export interface WeekCellLayout {
  /** The picture sits above the name instead of beside it. */
  pictureAbove: boolean;
  /** The most lines the name may take before it ends in an ellipsis. */
  nameLines: number;
  /**
   * About how many letters a line of the name holds. A longer word cannot fit
   * whole, and the view gives it a box of its own to end in an ellipsis.
   */
  lineChars: number;
  /** The serving time shows, on the line under the name. */
  showTime: boolean;
  /**
   * Where the course count goes: beside a picture above the name, on the line
   * under the name, or after the name when that line has no room. Null for a
   * meal without courses.
   */
  countAt: 'picture' | 'line' | 'name' | null;
}

/**
 * A dish name in the pieces a cell sets it in: its words, so lines break at
 * its spaces and nowhere else. A dash between spaces stays with the word
 * before it, so no line starts with one ("Rømmegrøt –" over "Norwegian...",
 * not "Rømmegrøt" over "– Norwegian...").
 */
export function weekCellWords(name: string): string[] {
  return name.replace(/ ([-–—]) /g, '\u00a0$1 ').split(' ').filter(Boolean);
}

/**
 * How much longer than a line (by `lineChars`) a word must be to get a box
 * of its own. The letter count is an estimate, and a box around a word that
 * fits after all leaves no room for the clamp's closing ellipsis, which then
 * runs off the cell ("Enchiladas..").
 */
const LONG_WORD_MARGIN = 1.15;

/**
 * A name's words as the view draws them: runs of plain text, and each word
 * clearly too long for a line on its own, for a box that ends it in an
 * ellipsis (Chromium puts one on any line of plain text that runs over,
 * Firefox only on a clamped name's last line).
 */
export function weekCellPieces(words: readonly string[], lineChars: number): { text: string; box: boolean }[] {
  const pieces: { text: string; box: boolean }[] = [];
  words.forEach((word, i) => {
    const space = i > 0 ? ' ' : '';
    const last = pieces[pieces.length - 1];
    if (word.length > lineChars * LONG_WORD_MARGIN) {
      if (space) {
        if (last && !last.box) last.text += space;
        else pieces.push({ text: space, box: false });
      }
      pieces.push({ text: word, box: true });
    } else if (last && !last.box) {
      last.text += space + word;
    } else {
      pieces.push({ text: space + word, box: false });
    }
  });
  return pieces;
}

/**
 * Lays out one cell. Unmeasured, the cell keeps the layout it is authored
 * with: the picture beside the name, the time and the count under it.
 */
export function weekCellLayout(room: WeekCellRoom): WeekCellLayout {
  const hasCount = room.countPx > 0;
  if (room.cellPx <= 0) {
    return { pictureAbove: false, nameLines: NAME_MAX_LINES, lineChars: Infinity, showTime: room.timePx > 0, countAt: hasCount ? 'line' : null };
  }
  const nameLine = NAME_LINE_HEIGHT * room.namePx;

  // The picture goes above a name it would squeeze to a few letters, but
  // only in a row tall enough for it over both of the name's lines: a short
  // row keeps it beside the name rather than spill into the next day. It
  // also goes above for a word that would not fit beside it ("Cheeseburgers"
  // cut to "Cheeseb..."), when that costs the serving time nothing.
  const pictured = room.picturePx > 0;
  const besidePx = room.cellPx - room.picturePx - WEEK_GAP_PX;
  const stackedPx = room.picturePx + WEEK_GAP_PX + NAME_MAX_LINES * nameLine;
  const squeezed = besidePx < NAME_MIN_CHARS * NAME_CHAR_EM * room.namePx && stackedPx <= room.rowPx;
  const wordCut = besidePx < room.longestWordChars * NAME_CHAR_EM * room.namePx
    && stackedPx + (room.timePx > 0 ? WEEK_LINE_GAP_PX + room.smallLinePx : 0) <= room.rowPx;
  const pictureAbove = pictured && (squeezed || wordCut);
  const abovePx = pictureAbove ? room.picturePx + WEEK_GAP_PX : 0;
  const nameWidth = pictured && !pictureAbove ? besidePx : room.cellPx;

  // Two lines of name where the row has them, else one.
  const nameLines = abovePx + NAME_MAX_LINES * nameLine <= room.rowPx ? NAME_MAX_LINES : 1;
  // The lines this name takes: a short one leaves its second line free for the time.
  const fitsOneLine = room.nameChars * NAME_CHAR_EM * room.namePx <= nameWidth * ONE_LINE_FILL;
  const nameHeight = (fitsOneLine ? 1 : nameLines) * nameLine;
  // A picture beside the name makes the line at least as tall as itself.
  const dishPx = abovePx + (pictured && !pictureAbove ? Math.max(nameHeight, room.picturePx) : nameHeight);

  // Under the name: the time and, unless it rides beside the picture, the
  // count, side by side or the count wrapped under the time when the cell is
  // too narrow for both. Each shows whole or not at all, and the count (which
  // says the meal has more dishes) outlasts the time.
  const spare = room.rowPx - dishPx - WEEK_LINE_GAP_PX;
  const holds = (lines: number) => lines * room.smallLinePx + (lines - 1) * WEEK_LINE_GAP_PX <= spare;
  const timeFits = room.timePx > 0 && room.timePx <= room.cellPx;
  let showTime = false;
  let countOnLine = false;
  if (hasCount && !pictureAbove) {
    const sideBySide = room.timePx + WEEK_GAP_PX + room.countPx <= room.cellPx;
    showTime = timeFits && holds(sideBySide ? 1 : 2);
    countOnLine = showTime || holds(1);
  } else {
    showTime = timeFits && holds(1);
  }

  return {
    pictureAbove,
    nameLines,
    lineChars: nameWidth / (NAME_CHAR_EM * room.namePx),
    showTime,
    countAt: !hasCount ? null : pictureAbove ? 'picture' : countOnLine ? 'line' : 'name',
  };
}

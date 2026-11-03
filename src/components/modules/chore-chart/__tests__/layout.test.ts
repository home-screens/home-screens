
import type { FamilyMember } from '@/types/family';
import { describe, it, expect } from 'vitest';
import { balanceRows, boardColumns, boardIconSize, boardMinColumnWidth, boardNameLines, boardNameRoom, choreDotGap, choreDotSize, choreTapSize, fitBoard, fitChoreFontSize, fitPerRow, fitStoreFontSize, partitionMembers, resolveHistoryLimit, starIconSize, storeRailEm, storeRailShowsBalances, storeTileColumns, storeUsesRail, weekMembers, type StoreFitInput } from '../layout';
import type { MemberStats, ResolvedAssignment } from '../types';


function stats(total: number, weekAssigned: number): MemberStats {
  return { total, completed: 0, percentage: 0, streak: 0, weeklyPoints: 0, weeklyPointsTotal: 0, rewardBalance: 0, weekAssigned };
}

const member = (id: string): FamilyMember => ({ createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', id, name: id, emoji: '', color: '#fff' });

describe('balanceRows', () => {
  it('keeps everything on one row when it fits', () => {
    expect(balanceRows([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(balanceRows([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('spreads a remainder across rows instead of leaving a lone trailing item', () => {
    expect(balanceRows([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5], [6, 7]]);
    expect(balanceRows([1, 2, 3, 4], 3)).toEqual([[1, 2], [3, 4]]);
    expect(balanceRows([1, 2, 3, 4, 5], 4)).toEqual([[1, 2, 3], [4, 5]]);
  });

  it('splits evenly when the count divides', () => {
    expect(balanceRows([1, 2, 3, 4, 5, 6], 3)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it('never returns an empty row and tolerates a zero or fractional limit', () => {
    expect(balanceRows([], 3)).toEqual([]);
    expect(balanceRows([1, 2], 0)).toEqual([[1], [2]]);
    expect(balanceRows([1, 2, 3], 2.9)).toEqual([[1, 2], [3]]);
  });
});

describe('fitPerRow', () => {
  it('counts how many items fit with gaps between them', () => {
    // 468px wide, 144px items, 8px gaps: 3 fit (3*144 + 2*8 = 448), 4 do not.
    expect(fitPerRow(468, 144, 8, 6)).toBe(3);
    expect(fitPerRow(900, 144, 8, 6)).toBe(5);
  });

  it('never exceeds the item count and never drops below one', () => {
    expect(fitPerRow(2000, 144, 8, 2)).toBe(2);
    expect(fitPerRow(100, 144, 8, 6)).toBe(1);
  });

  it('fits everything on one row while the width is unmeasured', () => {
    expect(fitPerRow(0, 144, 8, 6)).toBe(6);
  });
});

describe('partitionMembers', () => {
  const m = new Map<string, MemberStats>([
    ['kid', stats(3, 12)],
    ['rest', stats(0, 4)],
    ['parent', stats(0, 0)],
  ]);
  const members = [member('parent'), member('kid'), member('rest'), member('unknown')];

  it('splits members into active, day off, and idle', () => {
    const { active, dayOff, idle } = partitionMembers(members, m);
    expect(active.map((x) => x.id)).toEqual(['kid']);
    expect(dayOff.map((x) => x.id)).toEqual(['rest']);
    expect(idle.map((x) => x.id)).toEqual(['parent', 'unknown']);
  });

  it('keeps the household order within each group', () => {
    const { idle } = partitionMembers([member('unknown'), member('parent')], m);
    expect(idle.map((x) => x.id)).toEqual(['unknown', 'parent']);
  });

  it('charts everyone with chores this week, in order', () => {
    expect(weekMembers(members, m).map((x) => x.id)).toEqual(['kid', 'rest']);
  });
});

describe('board columns', () => {
  const assign = (memberId: string, names: string[], skipped = 0): ResolvedAssignment[] => names.map((name, i) => ({
    chore: { id: `${memberId}-${i}`, name, emoji: 'lucide:sparkles', points: 1, frequency: 'daily', daysOfWeek: [], timeOfDay: 'anytime', assigneeIds: [memberId], rotation: 'fixed' },
    memberId, isCompleted: false, isSkipped: i < skipped, groupIds: [],
  }));
  // A real household's chores: five children with three to five each today,
  // two on a day off, a parent with nothing all week.
  const lists: Record<string, string[]> = {
    a: ['Unload Dishwasher', 'Wipe Counters', 'Water Plants'],
    b: ['Set the Table', 'Make Bed', 'Feed the Dog', 'Organize the Pantry'],
    c: ['Unload Dishwasher', 'Wipe Counters', 'Water Plants', 'Set the Table', 'Make Bed'],
    d: ['Feed the Dog', 'Organize the Pantry', 'Make Bed'],
    e: ['Wipe Counters', 'Water Plants', 'Set the Table', 'Feed the Dog'],
  };
  const kids = Object.keys(lists);
  const members = [member('parent'), ...kids.map(member), member('off1'), member('off2')];
  const memberStats = new Map<string, MemberStats>([
    ['parent', stats(0, 0)],
    ...kids.map((id) => [id, stats(lists[id].length, 20)] as [string, MemberStats]),
    ['off1', stats(0, 6)],
    ['off2', stats(0, 6)],
  ]);
  const today = kids.flatMap((id) => assign(id, lists[id]));

  it('gives everyone with chores this week a column, day offs included, in household order', () => {
    const columns = boardColumns(members, memberStats, today);
    expect(columns.map((c) => c.member.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'off1', 'off2']);
    expect(columns.map((c) => c.chores.length)).toEqual([3, 4, 5, 3, 4, 0, 0]);
  });

  it('lists only what is owed: a chore marked not today is not in the column', () => {
    const columns = boardColumns([member('a')], new Map([['a', stats(2, 9)]]), assign('a', ['One', 'Two', 'Three'], 1));
    expect(columns[0].chores).toHaveLength(2);
  });

  describe('boardNameLines', () => {
    // At 20px a name is set at 16px.
    it('wraps whole words greedily', () => {
      expect(boardNameLines('Make Bed', 200, 20)).toBe(1);
      expect(boardNameLines('Unload Dishwasher', 110, 20)).toBe(2);
    });

    it('counts a word too wide for its line as breaking inside itself', () => {
      expect(boardNameLines('Dishwasher', 50, 20)).toBeGreaterThan(1);
    });

    it('never counts more lines than the board shows', () => {
      expect(boardNameLines('Organize the Pantry', 30, 20)).toBe(3);
    });
  });

  describe('fitBoard', () => {
    const columns = boardColumns(members, memberStats, today);
    // The default 1000x560 card, less its 16px padding and 1px border.
    const portrait = { width: 966, height: 526, requested: 24, columns, showTitle: true, showBalance: true, allDone: false };
    // The household's landscape screen: a 620x660 card.
    const landscape = { ...portrait, width: 586, height: 626 };

    /**
     * The board as drawn at the fit: every column at the width of the widest
     * row's, each card as deep as its name's lines, a day off one line deep.
     */
    const drawn = (box: typeof portrait, fit: { fontSize: number; perRow: number }) => {
      const f = fit.fontSize;
      const rows = balanceRows([...columns], fit.perRow);
      const across = Math.max(...rows.map((r) => r.length));
      const columnWidth = (box.width - (across - 1) * 8) / across;
      const card = (lines: number) => Math.max(choreTapSize(f), lines * f) + 0.48 * f;
      const deepest = Math.max(card(1), ...columns.map(({ chores }) => chores.reduce(
        (sum, { chore }) => sum + card(boardNameLines(chore.name, boardNameRoom(columnWidth, f, true), f)),
        Math.max(0, chores.length - 1) * 4,
      )));
      const column = 12 + 4 + 1.95 * f + 1.05 * f + (box.showBalance ? 2 + 0.825 * f : 0) + deepest + 6 + 0.35 * f + 2 + 0.9 * f;
      const height = 8 + 1.275 * f + rows.length * column + (rows.length - 1) * 8 + (box.allDone ? 8 + 1.125 * f : 0);
      // Every word of every name sits whole on a line of its card.
      const wordsWhole = columns.every(({ chores }) => chores.every(({ chore }) =>
        chore.name.split(' ').every((word) => boardNameLines(word, boardNameRoom(columnWidth, f, true), f) === 1)));
      return { height, rows: rows.length, columnWidth, wordsWhole };
    };

    for (const [label, box] of [['portrait 966x526', portrait], ['landscape 586x626', landscape]] as const) {
      for (const allDone of [false, true]) {
        it(`fits every chore with every word whole: ${label}${allDone ? ', everything ticked' : ''}`, () => {
          const at = { ...box, allDone };
          const fit = fitBoard(at);
          const board = drawn(at, fit);
          expect(board.height).toBeLessThanOrEqual(at.height);
          expect(board.wordsWhole).toBe(true);
          expect(board.columnWidth).toBeGreaterThanOrEqual(boardMinColumnWidth(columns, fit.fontSize));
          expect(fit.fontSize).toBeGreaterThan(11);
        });
      }
    }

    it('shrinks a row of seven until "Dishwasher" sits whole, instead of breaking it', () => {
      // Six em alone allowed one row of seven 131px columns at 21.86px, where
      // "Counters" and "Dishwasher" broke in half beside the tap box and icon.
      const columnWidth = (966 - 6 * 8) / 7;
      expect(boardNameLines('Dishwasher', boardNameRoom(columnWidth, 21.86, true), 21.86)).toBeGreaterThan(1);
      const fit = fitBoard(portrait);
      expect(fit.fontSize).toBeLessThan(21.86);
      expect(drawn(portrait, fit).wordsWhole).toBe(true);
    });

    it('wraps a tall, narrow landscape card into fewer rows than the authored size did', () => {
      // Wrapped at the authored 24px this was three rows, too tall even at the 11px floor.
      expect(drawn(landscape, fitBoard(landscape)).rows).toBeLessThan(3);
    });

    it('wraps into several rows on a narrow card where one row could not hold the words', () => {
      const narrow = { ...portrait, width: 420, height: 1600 };
      const fit = fitBoard(narrow);
      const board = drawn(narrow, fit);
      expect(board.rows).toBeGreaterThan(2);
      expect(board.height).toBeLessThanOrEqual(narrow.height);
      expect(board.wordsWhole).toBe(true);
    });

    it('sizes for the columns drawn, not only the people with a chore today', () => {
      // Counting the five with chores today kept the type for five columns, while the board drew seven.
      const fiveOnly = fitBoard({ ...portrait, columns: columns.slice(0, 5) });
      expect(fitBoard(portrait).fontSize).toBeLessThan(fiveOnly.fontSize);
    });

    it('gives a tie to fewer rows', () => {
      // A light day fits at the full 24px in one row and in more.
      const light = boardColumns([member('x'), member('y')], new Map([['x', stats(1, 5)], ['y', stats(1, 5)]]), [
        ...assign('x', ['Make Bed']),
        ...assign('y', ['Feed the Dog']),
      ]);
      expect(fitBoard({ ...portrait, columns: light })).toEqual({ fontSize: 24, perRow: 2 });
    });

    it('makes room for the "all done" line once everything is ticked', () => {
      expect(fitBoard({ ...portrait, allDone: true }).fontSize).toBeLessThanOrEqual(fitBoard(portrait).fontSize);
      expect(drawn({ ...portrait, allDone: true }, fitBoard({ ...portrait, allDone: true })).height).toBeLessThanOrEqual(526);
    });

    it('keeps the authored size, one row across, until the box has been measured', () => {
      expect(fitBoard({ ...portrait, width: 0, height: 0 })).toEqual({ fontSize: 24, perRow: 7 });
    });
  });

  it('keeps the member icon at 28px on a full-size board and inside its line as the type shrinks', () => {
    expect(boardIconSize(24)).toBe(28);
    expect(boardIconSize(40)).toBe(28);
    for (const f of [11, 12, 16, 20]) {
      // An emoji icon draws at 0.75 of its size on a 1.5 line; the row is a 1.3em line.
      expect(boardIconSize(f) * 0.75 * 1.5).toBeLessThanOrEqual(1.95 * f);
      expect(boardIconSize(f)).toBeLessThanOrEqual(1.95 * f);
    }
  });
});

describe('assignee dots on a today row', () => {
  it('keeps a fingertip floor however small the chart is fitted', () => {
    expect(choreDotSize(11)).toBe(24);
    expect(choreDotSize(4)).toBe(24);
  });

  it('stops growing, so five dots never take the width the chore name needs', () => {
    expect(choreDotSize(40)).toBe(40);
    expect(choreDotSize(200)).toBe(40);
  });

  it('scales with the fitted type between those bounds', () => {
    expect(choreDotSize(22)).toBe(33);
  });

  it('keeps the gap visible at the smallest dot, so five rings do not read as one blob', () => {
    expect(choreDotGap(choreDotSize(11))).toBeGreaterThanOrEqual(3);
  });
});

describe('fitChoreFontSize', () => {
  const day = { width: 476, height: 626, requested: 24, rows: 10, sections: 4, view: 'today' };

  it('shrinks a busy day to fit its own default card', () => {
    // Ten chores at the module's 24px default need ~780px of rows; the card
    // is 650. Before this the last three were cut off mid-row.
    const fitted = fitChoreFontSize(day);
    expect(fitted).toBeLessThan(24);
    // The list, at the size it settled on, fits the box it was given. A
    // `today` row is its assignee dot plus the view's own 0.7em of padding.
    const rowPx = choreDotSize(fitted) + 0.7 * fitted;
    const gaps = (day.sections - 1) * 8;
    expect(day.rows * rowPx + day.sections * 1.9 * fitted + 3.7 * fitted + gaps)
      .toBeLessThanOrEqual(day.height);
  });

  it('accounts for the tap target refusing to shrink past its own floor', () => {
    // Rows stop shrinking with the type once the dot hits its 24px floor,
    // so the fit has to search rather than divide: at 14 chores a closed-form
    // solve returns a size whose rows still overflow.
    const fitted = fitChoreFontSize({ ...day, rows: 12, sections: 4 });
    const rowPx = choreDotSize(fitted) + 0.7 * fitted;
    expect(12 * rowPx + 4 * 1.9 * fitted + 3.7 * fitted + 24).toBeLessThanOrEqual(day.height);
  });

  it('bottoms out at the floor when no size can fit the day, leaving the rest to the list', () => {
    // Twenty rows cannot fit 626px even at the floor: the list scrolls and
    // says how many are below it (see FitRows) instead of vanishing.
    expect(fitChoreFontSize({ ...day, rows: 20, sections: 4 })).toBe(11);
  });

  it('leaves a light day at the size the household asked for', () => {
    expect(fitChoreFontSize({ ...day, rows: 3, sections: 2 })).toBe(24);
  });

  it('never exceeds the module font size, however big the box', () => {
    expect(fitChoreFontSize({ ...day, width: 4000, height: 4000, rows: 1, sections: 1 })).toBe(24);
  });

  it('stops shrinking at a readable floor rather than vanishing', () => {
    expect(fitChoreFontSize({ ...day, height: 120, rows: 30, sections: 4 })).toBe(11);
  });

  it('keeps the authored size until the box has been measured', () => {
    expect(fitChoreFontSize({ ...day, width: 0, height: 0 })).toBe(24);
  });

  it('leaves room for compact\'s member header and totals legend', () => {
    // Compact draws shorter rows than the list views but carries far more
    // chrome, so the fit has to budget for the chrome, not just the rows.
    const compact = fitChoreFontSize({ ...day, view: 'compact', sections: 0 });
    expect(day.rows * (choreTapSize(compact) + 0.5 * compact) + 9 * compact)
      .toBeLessThanOrEqual(day.height);
  });
});

describe('choreTapSize', () => {
  it('keeps a fingertip target while the type allows one', () => {
    expect(choreTapSize(24)).toBe(38);
  });

  it('shrinks with the type rather than pushing chores off the bottom', () => {
    expect(choreTapSize(16)).toBeLessThan(38);
  });

  it('never goes below a size a child can hit', () => {
    expect(choreTapSize(11)).toBe(24);
  });
});

describe('fitChoreFontSize, star chart', () => {
  // rows = charted members, sections = legend rows.
  const chart = { width: 476, height: 626, requested: 24, rows: 5, sections: 1, view: 'star-chart' };

  it('keeps seven days of stars inside the width rather than squeezing the columns', () => {
    // The name column plus seven day columns need about 20em across; the list
    // views' 13em let the table run past its own box.
    expect(fitChoreFontSize({ ...chart, width: 300 })).toBeLessThanOrEqual(300 / 20);
  });

  it('shrinks for a bigger household', () => {
    const five = fitChoreFontSize(chart);
    const seven = fitChoreFontSize({ ...chart, rows: 7, sections: 2, height: 300, width: 300 });
    expect(seven).toBeLessThan(five);
  });

  it('bottoms out at the floor when the household cannot fit', () => {
    // Ten kids in a 300x300 card is past any size that helps: it stops at the
    // floor and FitRows says how many are below.
    expect(fitChoreFontSize({ ...chart, rows: 10, sections: 3, width: 300, height: 300 })).toBe(11);
  });

  it('leaves the authored size alone when the chart already fits', () => {
    expect(fitChoreFontSize({ ...chart, rows: 2, sections: 1, width: 900, height: 900 })).toBe(24);
  });
});

describe('starIconSize', () => {
  it('scales the member icon with the chart instead of pinning it at 18px', () => {
    expect(starIconSize(24)).toBeGreaterThan(starIconSize(12));
  });

  it('stays visible at the floor and never dwarfs a big chart', () => {
    expect(starIconSize(4)).toBe(10);
    expect(starIconSize(100)).toBe(22);
  });
});


describe('fitChoreFontSize, reward history', () => {
  const card = { width: 476, height: 626, requested: 24, sections: 0, view: 'reward-history' };

  it('leaves a short history at the size the household asked for when the card is wide enough', () => {
    expect(fitChoreFontSize({ ...card, width: 900, rows: 5 })).toBe(24);
  });

  it('holds the type to what four columns of words can fit across the card', () => {
    expect(fitChoreFontSize({ ...card, rows: 5 })).toBeCloseTo(476 / 24, 5);
  });

  it('shrinks a long history so every row it promises fits the card', () => {
    const fitted = fitChoreFontSize({ ...card, rows: 20 });
    expect(fitted).toBeLessThan(24);
    expect(fitted).toBeGreaterThan(11);
    // A row is 2em plus its 1px rule; the title and the pill strip are 4.1em.
    expect(20 * (2 * fitted + 1) + 4.1 * fitted).toBeLessThanOrEqual(card.height);
  });
});

describe('resolveHistoryLimit', () => {
  it('falls back to five when the value is missing or not a number', () => {
    for (const raw of [undefined, null, 'abc', NaN, Infinity]) expect(resolveHistoryLimit(raw)).toBe(5);
  });

  it('keeps a whole number inside one to fifty', () => {
    expect(resolveHistoryLimit(12)).toBe(12);
    expect(resolveHistoryLimit(5.5)).toBe(5);
    expect(resolveHistoryLimit(0)).toBe(1);
    expect(resolveHistoryLimit(500)).toBe(50);
  });
});

describe('fitStoreFontSize', () => {
  const card: StoreFitInput = { width: 468, height: 618, requested: 24, layout: 'list', count: 8, showTitle: true, showPicker: true, members: 6, showBalance: true, readOnly: false };

  it('shrinks the type until the rewards fit under the picker', () => {
    const fitted = fitStoreFontSize({ ...card, count: 7 });
    expect(fitted).toBeLessThan(24);
    expect(fitted).toBeGreaterThan(18);
  });

  it('leaves a short list at the size the household asked for', () => {
    expect(fitStoreFontSize({ ...card, count: 3 })).toBe(24);
  });

  it('lets a read-only list keep shrinking to show everything, where pills would stop and scroll', () => {
    const readOnly = fitStoreFontSize({ ...card, count: 12, readOnly: true });
    expect(readOnly).toBeGreaterThan(11);
    expect(readOnly).toBeLessThan(18);
    expect(fitStoreFontSize({ ...card, count: 12 })).toBe(18);
  });

  it('stops at a floor that still reads beside a 44px pill, and lower when there are no pills', () => {
    expect(fitStoreFontSize({ ...card, count: 40 })).toBe(18);
    expect(fitStoreFontSize({ ...card, count: 40, readOnly: true })).toBe(11);
  });

  it('never lifts the type above what the household asked for', () => {
    expect(fitStoreFontSize({ ...card, requested: 14, count: 40 })).toBe(14);
  });

  it('gives the rewards the whole height once the picker moves to the rail', () => {
    const wide = { ...card, width: 868, height: 328, count: 4 };
    expect(storeUsesRail(wide.width, wide.height)).toBe(true);
    expect(fitStoreFontSize(wide)).toBeGreaterThan(20);
    // The same four rewards under a stacked picker bottom out.
    expect(fitStoreFontSize({ ...wide, width: 600 })).toBe(18);
  });

  it('shrinks for the rail too: seven people beside one reward in a very short card', () => {
    // One reward fits 208px at any size, so the type used to stay at 24px and
    // the third row of avatars and the balance ran off the bottom of the card.
    const short = { ...card, width: 868, height: 228, count: 1, members: 7 };
    const fitted = fitStoreFontSize(short);
    expect(fitted).toBeLessThan(24);
    expect(fitted).toBeGreaterThan(18);
    expect((1.5 + 0.5 + storeRailEm(7, false)) * fitted).toBeLessThanOrEqual(228 + 0.01);
    // At that size there is no room for a balance under each avatar as well.
    expect(storeRailShowsBalances(7, 228, fitted, true)).toBe(false);
    expect(storeRailShowsBalances(3, 328, 20, true)).toBe(true);
    // Shorter still and it stops at the floor that keeps avatars tappable;
    // the rail scrolls from there, with the balance at its top.
    expect(fitStoreFontSize({ ...short, height: 180 })).toBe(18);
  });

  it('keeps the authored size until the box has been measured', () => {
    expect(fitStoreFontSize({ ...card, width: 0, height: 0 })).toBe(24);
  });
});

describe('storeTileColumns', () => {
  it('goes three across in the default card and never below two or above four', () => {
    expect(storeTileColumns(468, 18)).toBe(3);
    expect(storeTileColumns(200, 24)).toBe(2);
    expect(storeTileColumns(2000, 12)).toBe(4);
  });
});

describe('storeUsesRail', () => {
  it('is for wide, short cards only', () => {
    expect(storeUsesRail(468, 618)).toBe(false);
    expect(storeUsesRail(868, 328)).toBe(true);
    // Wide in shape but too narrow to give up 13em.
    expect(storeUsesRail(500, 250)).toBe(false);
  });
});

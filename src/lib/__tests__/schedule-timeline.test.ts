import { describe, it, expect } from 'vitest';
import { computeWeekSegments, subtractRanges, MINUTES_PER_DAY } from '../schedule-timeline';
import type { ModuleSchedule } from '@/types/config';

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;

/** Compact shape for assertions: [day, startMin, endMin, fromPrev, toNext]. */
const shape = (schedule: ModuleSchedule) =>
  computeWeekSegments(schedule).map((s) => [
    s.day, s.startMin, s.endMin, s.continuesFromPrev, s.continuesToNext,
  ]);

describe('computeWeekSegments', () => {
  it('draws a same-day window once per selected day, with no continuations', () => {
    expect(shape({ daysOfWeek: [MON, TUE], startTime: '07:00', endTime: '09:00' })).toEqual([
      [MON, 420, 540, false, false],
      [TUE, 420, 540, false, false],
    ]);
  });

  it('draws the reported single-day overnight schedule as two joined pieces', () => {
    // Tuesday 4:00 PM until Wednesday 8:00 AM - what the reporter wanted.
    expect(shape({ daysOfWeek: [TUE], startTime: '16:00', endTime: '08:00' })).toEqual([
      [TUE, 960, MINUTES_PER_DAY, false, true],
      [WED, 0, 480, true, false],
    ]);
  });

  it('draws the reported misconfiguration as two separate stretches', () => {
    // Tuesday AND Wednesday ticked - what the reporter actually built.
    const segs = shape({ daysOfWeek: [TUE, WED], startTime: '16:00', endTime: '08:00' });
    expect(segs).toEqual([
      [TUE, 960, MINUTES_PER_DAY, false, true],
      [WED, 0, 480, true, false],
      [WED, 960, MINUTES_PER_DAY, false, true],
      [THU, 0, 480, true, false],
    ]);
    // The gap across the middle of Wednesday is the thing the panel never showed.
    const wed = segs.filter((s) => s[0] === WED);
    expect(wed).toHaveLength(2);
    expect(wed[0][2]).toBe(480);
    expect(wed[1][1]).toBe(960);
  });

  it('wraps Saturday into Sunday', () => {
    // Emitted in day order, so Sunday's spillover leads even though it is the
    // tail of Saturday's stretch. The strip renders rows in day order too.
    expect(shape({ daysOfWeek: [SAT], startTime: '22:00', endTime: '06:00' })).toEqual([
      [SUN, 0, 360, true, false],
      [SAT, 1320, MINUTES_PER_DAY, false, true],
    ]);
  });

  it('lights every day fully when no window or days are set', () => {
    const segs = computeWeekSegments({});
    expect(segs).toHaveLength(7);
    for (const s of segs) {
      expect([s.startMin, s.endMin]).toEqual([0, MINUTES_PER_DAY]);
      expect(s.continuesFromPrev && s.continuesToNext).toBe(true);
    }
  });

  it('inverts a window into the rest of the week', () => {
    // Hidden Mon 07:00-09:00; lit everywhere else, including all of Sunday.
    const segs = shape({ daysOfWeek: [MON], startTime: '07:00', endTime: '09:00', invert: true });
    expect(segs.filter((s) => s[0] === MON)).toEqual([
      [MON, 0, 420, true, false],
      [MON, 540, MINUTES_PER_DAY, false, true],
    ]);
    expect(segs.filter((s) => s[0] === SUN)).toEqual([[SUN, 0, MINUTES_PER_DAY, true, true]]);
  });

  it('draws equal times as a full day, joined onto the next row', () => {
    // What the strip's end drag stores at its 24-hour cap.
    expect(shape({ daysOfWeek: [MON], startTime: '08:00', endTime: '08:00' })).toEqual([
      [MON, 480, MINUTES_PER_DAY, false, true],
      [TUE, 0, 480, true, false],
    ]);
  });

  it('treats a start-only window as running to midnight', () => {
    expect(shape({ daysOfWeek: [FRI], startTime: '18:00' })).toEqual([
      [FRI, 1080, MINUTES_PER_DAY, false, false],
    ]);
  });

  it('repeating a daily window is not the same as one long span', () => {
    // Fri 18:00 -> Mon 08:00 written as three nightly windows leaves daylight
    // gaps on Sat and Sun. This is the mistake endDayOffset exists to avoid.
    const segs = computeWeekSegments({ daysOfWeek: [FRI, SAT, SUN], startTime: '18:00', endTime: '08:00' });
    const litOnSaturdayNoon = segs.some(
      (s) => s.day === SAT && s.startMin <= 720 && s.endMin > 720,
    );
    expect(litOnSaturdayNoon).toBe(false);
  });

  it('draws a Monday 08:00 to Thursday 20:00 span as one unbroken run', () => {
    const segs = shape({ daysOfWeek: [MON], startTime: '08:00', endTime: '20:00', endDayOffset: 3 });
    expect(segs).toEqual([
      [MON, 480, MINUTES_PER_DAY, false, true],
      [TUE, 0, MINUTES_PER_DAY, true, true],
      [WED, 0, MINUTES_PER_DAY, true, true],
      [THU, 0, 1200, true, false],
    ]);
    // Exactly one lit run per day, so it reads as a single stretch rather than
    // four nightly ones.
    for (const day of [MON, TUE, WED, THU]) {
      expect(segs.filter((s) => s[0] === day)).toHaveLength(1);
    }
  });

  /**
   * Reported from the editor: Sun, Mon and Tue ticked with a four-day span
   * merges into one run covering the week. Dragging the Saturday end used to
   * report Sunday as its anchor, because the anchor was found by chaining back
   * through merged segments, so a nudge rewrote the span from 4 to 6 and lit
   * everything. The anchor is derived from the span now, not walked.
   */
  it('anchors a merged run to the window that actually closes it', () => {
    const s = { daysOfWeek: [0, 1, 2], startTime: '08:00', endTime: '19:00', endDayOffset: 4 };
    const segs = computeWeekSegments(s);
    const closing = segs.find((x) => !x.continuesToNext)!;
    // Saturday's end belongs to Tuesday's window: Tue + 4 = Sat.
    expect(closing.day).toBe(SAT);
    expect(closing.closingAnchorDay).toBe(TUE);
    // Dragging it without leaving its row leaves the span alone.
    expect((closing.day - closing.closingAnchorDay! + 7) % 7).toBe(4);
  });

  it('names the closing anchor only on the piece that actually ends a stretch', () => {
    // Mon 08:00 to Thu 20:00: only the Thursday piece has an end to drag, and
    // it belongs to Monday's window. The three pass-through pieces have none.
    const mth = computeWeekSegments({ daysOfWeek: [MON], startTime: '08:00', endTime: '20:00', endDayOffset: 3 });
    expect(mth.map((s) => [s.day, s.closingAnchorDay])).toEqual([
      [MON, undefined], [TUE, undefined], [WED, undefined], [THU, MON],
    ]);

    // Overnight spillover closes on Wednesday but belongs to Tuesday.
    const overnight = computeWeekSegments({ daysOfWeek: [TUE], startTime: '16:00', endTime: '08:00' });
    expect(overnight.map((s) => [s.day, s.closingAnchorDay])).toEqual([
      [TUE, undefined], [WED, TUE],
    ]);

    // Same-day windows each close on the day they opened.
    const plain = computeWeekSegments({ daysOfWeek: [MON, TUE], startTime: '07:00', endTime: '09:00' });
    expect(plain.map((s) => s.closingAnchorDay)).toEqual([MON, TUE]);
  });

  it('wraps a multi-day span past Saturday into Sunday', () => {
    // Friday 18:00 until Monday 08:00, as one stretch this time.
    const segs = shape({ daysOfWeek: [FRI], startTime: '18:00', endTime: '08:00', endDayOffset: 3 });
    expect(segs).toEqual([
      [SUN, 0, MINUTES_PER_DAY, true, true],
      [MON, 0, 480, true, false],
      [FRI, 1080, MINUTES_PER_DAY, false, true],
      [SAT, 0, MINUTES_PER_DAY, true, true],
    ]);
  });
});

describe('subtractRanges', () => {
  const r = (startMin: number, endMin: number) => ({ startMin, endMin });

  it('returns the base untouched when nothing overlaps', () => {
    expect(subtractRanges(r(100, 200), [r(0, 50), r(300, 400)])).toEqual([r(100, 200)]);
  });

  it('punches a hole in the middle', () => {
    expect(subtractRanges(r(0, 300), [r(100, 200)])).toEqual([r(0, 100), r(200, 300)]);
  });

  it('trims from either end', () => {
    expect(subtractRanges(r(100, 300), [r(0, 150)])).toEqual([r(150, 300)]);
    expect(subtractRanges(r(100, 300), [r(250, 400)])).toEqual([r(100, 250)]);
  });

  it('removes the range entirely when fully covered', () => {
    expect(subtractRanges(r(100, 200), [r(50, 250)])).toEqual([]);
  });
});

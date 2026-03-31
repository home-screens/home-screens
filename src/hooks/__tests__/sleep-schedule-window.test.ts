import { describe, it, expect } from 'vitest';
import { isInScheduleWindow } from '../useSleepManager';

function makeTime(hours: number, minutes: number): Date {
  const d = new Date(2026, 2, 15); // arbitrary date
  d.setHours(hours, minutes, 0, 0);
  return d;
}

describe('isInScheduleWindow', () => {
  describe('same-day window (e.g. 09:00–17:00)', () => {
    const schedule = { startTime: '09:00', endTime: '17:00' };

    it('returns true when inside the window', () => {
      expect(isInScheduleWindow(schedule, makeTime(9, 0))).toBe(true);
      expect(isInScheduleWindow(schedule, makeTime(12, 30))).toBe(true);
      expect(isInScheduleWindow(schedule, makeTime(16, 59))).toBe(true);
    });

    it('returns false when before the window', () => {
      expect(isInScheduleWindow(schedule, makeTime(8, 59))).toBe(false);
      expect(isInScheduleWindow(schedule, makeTime(0, 0))).toBe(false);
    });

    it('returns false when after or at the end of the window', () => {
      expect(isInScheduleWindow(schedule, makeTime(17, 0))).toBe(false);
      expect(isInScheduleWindow(schedule, makeTime(23, 59))).toBe(false);
    });
  });

  describe('overnight window (e.g. 23:00–06:00)', () => {
    const schedule = { startTime: '23:00', endTime: '06:00' };

    it('returns true during late night hours', () => {
      expect(isInScheduleWindow(schedule, makeTime(23, 0))).toBe(true);
      expect(isInScheduleWindow(schedule, makeTime(23, 59))).toBe(true);
    });

    it('returns true during early morning hours', () => {
      expect(isInScheduleWindow(schedule, makeTime(0, 0))).toBe(true);
      expect(isInScheduleWindow(schedule, makeTime(3, 30))).toBe(true);
      expect(isInScheduleWindow(schedule, makeTime(5, 59))).toBe(true);
    });

    it('returns false during daytime hours', () => {
      expect(isInScheduleWindow(schedule, makeTime(6, 0))).toBe(false);
      expect(isInScheduleWindow(schedule, makeTime(12, 0))).toBe(false);
      expect(isInScheduleWindow(schedule, makeTime(22, 59))).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles exact midnight boundaries', () => {
      const schedule = { startTime: '00:00', endTime: '06:00' };
      expect(isInScheduleWindow(schedule, makeTime(0, 0))).toBe(true);
      expect(isInScheduleWindow(schedule, makeTime(3, 0))).toBe(true);
      expect(isInScheduleWindow(schedule, makeTime(6, 0))).toBe(false);
    });

    it('handles window starting and ending at same time (zero-width)', () => {
      const schedule = { startTime: '12:00', endTime: '12:00' };
      // start === end uses same-day path: now >= 720 && now < 720, always false
      expect(isInScheduleWindow(schedule, makeTime(0, 0))).toBe(false);
      expect(isInScheduleWindow(schedule, makeTime(12, 0))).toBe(false);
      expect(isInScheduleWindow(schedule, makeTime(23, 59))).toBe(false);
    });

    it('handles single-minute window', () => {
      const schedule = { startTime: '14:00', endTime: '14:01' };
      expect(isInScheduleWindow(schedule, makeTime(14, 0))).toBe(true);
      expect(isInScheduleWindow(schedule, makeTime(14, 1))).toBe(false);
      expect(isInScheduleWindow(schedule, makeTime(13, 59))).toBe(false);
    });
  });
});

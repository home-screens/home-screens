import { describe, it, expect } from 'vitest';
import { isInScheduleWindow } from '../useSleepManager';

/** Build a Date at a specific hour:minute (date is irrelevant). */
function at(hours: number, minutes: number): Date {
  return new Date(2025, 0, 15, hours, minutes, 0);
}

describe('isInScheduleWindow', () => {
  describe('same-day window (09:00–17:00)', () => {
    const schedule = { startTime: '09:00', endTime: '17:00' };

    it('returns true when inside the window', () => {
      expect(isInScheduleWindow(schedule, at(12, 0))).toBe(true);
    });

    it('returns true at the exact start time', () => {
      expect(isInScheduleWindow(schedule, at(9, 0))).toBe(true);
    });

    it('returns false at the exact end time (exclusive)', () => {
      expect(isInScheduleWindow(schedule, at(17, 0))).toBe(false);
    });

    it('returns false before the window', () => {
      expect(isInScheduleWindow(schedule, at(8, 59))).toBe(false);
    });

    it('returns false after the window', () => {
      expect(isInScheduleWindow(schedule, at(17, 1))).toBe(false);
    });
  });

  describe('overnight window (23:00–06:00)', () => {
    const schedule = { startTime: '23:00', endTime: '06:00' };

    it('returns true late at night', () => {
      expect(isInScheduleWindow(schedule, at(23, 30))).toBe(true);
    });

    it('returns true early in the morning', () => {
      expect(isInScheduleWindow(schedule, at(3, 0))).toBe(true);
    });

    it('returns true at the exact start time', () => {
      expect(isInScheduleWindow(schedule, at(23, 0))).toBe(true);
    });

    it('returns false at the exact end time (exclusive)', () => {
      expect(isInScheduleWindow(schedule, at(6, 0))).toBe(false);
    });

    it('returns false during the day', () => {
      expect(isInScheduleWindow(schedule, at(12, 0))).toBe(false);
    });

    it('returns false just before the window starts', () => {
      expect(isInScheduleWindow(schedule, at(22, 59))).toBe(false);
    });
  });

  describe('midnight-anchored windows', () => {
    it('00:00–06:00 matches early morning', () => {
      const schedule = { startTime: '00:00', endTime: '06:00' };
      expect(isInScheduleWindow(schedule, at(0, 0))).toBe(true);
      expect(isInScheduleWindow(schedule, at(3, 0))).toBe(true);
      expect(isInScheduleWindow(schedule, at(6, 0))).toBe(false);
    });

    it('22:00–00:00 is an overnight window (end at midnight = next day)', () => {
      const schedule = { startTime: '22:00', endTime: '00:00' };
      expect(isInScheduleWindow(schedule, at(22, 0))).toBe(true);
      expect(isInScheduleWindow(schedule, at(23, 30))).toBe(true);
      // At midnight, nowMinutes (0) < endMinutes (0) is false, so this is outside
      expect(isInScheduleWindow(schedule, at(0, 0))).toBe(false);
    });
  });

  describe('equal start and end', () => {
    it('returns false when start === end (zero-length window)', () => {
      const schedule = { startTime: '12:00', endTime: '12:00' };
      expect(isInScheduleWindow(schedule, at(12, 0))).toBe(false);
      expect(isInScheduleWindow(schedule, at(0, 0))).toBe(false);
    });
  });
});

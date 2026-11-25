import { describe, expect, it } from 'vitest';
import type { CalendarSourceStatus } from '@/types/config';
import { calendarTrouble, GOOGLE_NOT_SIGNED_IN_KEY, needsGoogleSignIn } from '@/lib/calendar-trouble';

const ok = (id: string, name?: string): CalendarSourceStatus => ({ id, name, ok: true, fetchedAt: null });
const down = (id: string, name?: string, messageKey?: string): CalendarSourceStatus => ({ id, name, ok: false, messageKey, fetchedAt: null });

describe('calendarTrouble', () => {
  it('says nothing while every calendar answers, or when there is no status at all', () => {
    expect(calendarTrouble([ok('primary', 'Family'), ok('holidays')])).toBeNull();
    expect(calendarTrouble([])).toBeNull();
    expect(calendarTrouble(undefined)).toBeNull();
  });

  it('asks for a new Google sign-in when that is the only thing wrong', () => {
    expect(calendarTrouble([down('primary', 'Family', GOOGLE_NOT_SIGNED_IN_KEY), ok('school', 'School')])).toEqual({ kind: 'signIn' });
  });

  it('names the one calendar that stopped', () => {
    expect(calendarTrouble([down('school', 'School'), ok('primary', 'Family')])).toEqual({ kind: 'failing', name: 'School' });
  });

  it('does not name the public holidays, or several calendars', () => {
    expect(calendarTrouble([down('holidays')])).toEqual({ kind: 'failing', name: null });
    expect(calendarTrouble([down('a', 'A'), down('b', 'B')])).toEqual({ kind: 'failing', name: null });
    // A sign-in problem mixed with an outage is an outage.
    expect(calendarTrouble([down('primary', 'Family', GOOGLE_NOT_SIGNED_IN_KEY), down('school', 'School')])).toEqual({ kind: 'failing', name: null });
  });
});

describe('needsGoogleSignIn', () => {
  it('is false for nothing failing', () => {
    expect(needsGoogleSignIn([])).toBe(false);
  });
});

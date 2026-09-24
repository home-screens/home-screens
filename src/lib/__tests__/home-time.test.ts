import { describe, expect, it } from 'vitest';
import { phoneClockDiffersFromHome, viewerAwayFromHome } from '../home-time';

describe('viewerAwayFromHome', () => {
  it('is true for a laptop in Los Angeles and a home in Chicago', () => {
    expect(viewerAwayFromHome('America/Los_Angeles', 'America/Chicago')).toBe(true);
  });

  it('is false when both are the same zone, alias spellings included', () => {
    expect(viewerAwayFromHome('America/Chicago', 'America/Chicago')).toBe(false);
    expect(viewerAwayFromHome('Asia/Calcutta', 'Asia/Kolkata')).toBe(false);
  });

  it('is false while either zone is unknown', () => {
    expect(viewerAwayFromHome(null, 'America/Chicago')).toBe(false);
    expect(viewerAwayFromHome('America/Chicago', undefined)).toBe(false);
  });
});

describe('phoneClockDiffersFromHome', () => {
  // Thursday 24 September, 7:40 PM in Berlin: already Friday morning in
  // Kiritimati, and 12:40 PM the same day in Chicago.
  const THURSDAY_EVENING_BERLIN = new Date('2026-09-24T17:40:00Z');

  it('is true when home is already on the next day', () => {
    expect(phoneClockDiffersFromHome(THURSDAY_EVENING_BERLIN, 'Europe/Berlin', 'Pacific/Kiritimati')).toBe(true);
  });

  it('is true on the same day at a different hour', () => {
    expect(phoneClockDiffersFromHome(THURSDAY_EVENING_BERLIN, 'Europe/Berlin', 'America/Chicago')).toBe(true);
  });

  it('is false for a phone at home', () => {
    expect(phoneClockDiffersFromHome(THURSDAY_EVENING_BERLIN, 'America/Chicago', 'America/Chicago')).toBe(false);
  });

  it('is false while both clocks read the same day and hour', () => {
    // Kolkata is UTC+5:30 and Karachi UTC+5: at 10:15 UTC both read 3 PM
    // (3:45 and 3:15), and at 10:45 UTC Kolkata has moved on to 4 PM.
    expect(phoneClockDiffersFromHome(new Date('2026-09-24T10:15:00Z'), 'Asia/Karachi', 'Asia/Kolkata')).toBe(false);
    expect(phoneClockDiffersFromHome(new Date('2026-09-24T10:45:00Z'), 'Asia/Karachi', 'Asia/Kolkata')).toBe(true);
  });

  it('is false before the phone zone is known', () => {
    expect(phoneClockDiffersFromHome(THURSDAY_EVENING_BERLIN, null, 'Pacific/Kiritimati')).toBe(false);
  });
});

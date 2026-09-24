import { describe, expect, it } from 'vitest';
import { suggestHouseholdZone, zoneGapMinutes } from '../zone-suggestion';

describe('suggestHouseholdZone', () => {
  it("offers the place's own zone over this browser's", () => {
    // A Chicago laptop setting up a Boulder household.
    expect(suggestHouseholdZone('America/Denver', 'America/Chicago')).toEqual({ timezone: 'America/Denver', source: 'place' });
  });

  it("falls back to this browser's zone when the place's is not known", () => {
    expect(suggestHouseholdZone(null, 'America/Chicago')).toEqual({ timezone: 'America/Chicago', source: 'browser' });
    expect(suggestHouseholdZone('Not/AZone', 'America/Chicago')).toEqual({ timezone: 'America/Chicago', source: 'browser' });
  });

  it('offers nothing when neither is a real zone', () => {
    expect(suggestHouseholdZone(undefined, '')).toBeNull();
    expect(suggestHouseholdZone(null, '+05:30')).toBeNull();
  });
});

describe('zoneGapMinutes', () => {
  // 17:46 UTC on 2026-09-24: 12:46 in Chicago (CDT), 23:31 in Kathmandu.
  const at = new Date('2026-09-24T17:46:00Z');

  it("says how far one zone's clock runs ahead of another's", () => {
    expect(zoneGapMinutes('UTC', 'America/Chicago', at)).toBe(5 * 60);
    expect(zoneGapMinutes('America/Chicago', 'UTC', at)).toBe(-5 * 60);
    expect(zoneGapMinutes('America/Chicago', 'America/Chicago', at)).toBe(0);
  });

  it('keeps odd offsets and counts across the date line', () => {
    expect(zoneGapMinutes('Asia/Kathmandu', 'UTC', at)).toBe(5 * 60 + 45);
    // Kiritimati is already on Friday: +14 against Honolulu's -10.
    expect(zoneGapMinutes('Pacific/Kiritimati', 'Pacific/Honolulu', at)).toBe(24 * 60);
  });

  it('follows DST on the day asked about', () => {
    expect(zoneGapMinutes('UTC', 'America/Chicago', new Date('2026-12-24T17:46:00Z'))).toBe(6 * 60);
  });
});

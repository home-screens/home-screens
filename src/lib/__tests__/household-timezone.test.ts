import { describe, expect, it } from 'vitest';
import { resolveHouseholdTimezone, withHouseholdTimezone } from '../timezone';

describe("an unset household zone is the hub's", () => {
  it('prefers the saved zone', () => {
    expect(resolveHouseholdTimezone('America/Chicago', 'UTC')).toBe('America/Chicago');
  });

  it("uses the hub's zone when none is saved, never this machine's", () => {
    // Neither undefined nor '' may reach Intl, which would read the machine.
    expect(resolveHouseholdTimezone(undefined, 'Pacific/Kiritimati')).toBe('Pacific/Kiritimati');
    expect(resolveHouseholdTimezone('', 'Pacific/Kiritimati')).toBe('Pacific/Kiritimati');
  });

  it('names the zone on the settings, leaving saved settings untouched', () => {
    const saved = { timezone: 'Europe/Berlin', locale: 'de-DE' };
    expect(withHouseholdTimezone(saved, 'UTC')).toBe(saved);
    const unset = { locale: 'en-US' } as { timezone?: string; locale: string };
    expect(withHouseholdTimezone(unset, 'Asia/Kathmandu')).toEqual({ locale: 'en-US', timezone: 'Asia/Kathmandu' });
    expect(unset).not.toHaveProperty('timezone');
  });
});

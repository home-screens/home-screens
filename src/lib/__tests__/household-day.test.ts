import { afterEach, describe, expect, it, vi } from 'vitest';

const readConfigCached = vi.fn();
vi.mock('../config-cache', () => ({ readConfigCached: () => readConfigCached() }));

const { householdTimestamp, householdTimezone, householdToday, hubTimezone } = await import('../household-day');

afterEach(() => { readConfigCached.mockReset(); });

describe('household day', () => {
  // 02:05 UTC on the 24th: still the 23rd in Chicago, already the 24th in Kiritimati.
  const now = new Date('2026-09-24T02:05:00.000Z');

  it('is the calendar day in the Settings time zone, not the machine\'s', async () => {
    readConfigCached.mockResolvedValue({ settings: { timezone: 'America/Chicago' } });
    expect(await householdToday(now)).toBe('2026-09-23');
    readConfigCached.mockResolvedValue({ settings: { timezone: 'Pacific/Kiritimati' } });
    expect(await householdToday(now)).toBe('2026-09-24');
  });

  it('stamps times in that zone\'s offset', async () => {
    readConfigCached.mockResolvedValue({ settings: { timezone: 'America/Chicago' } });
    expect(await householdTimestamp(now)).toBe('2026-09-23T21:05:00.000-05:00');
  });

  // Unset means the hub's zone on every surface; the server is the hub.
  it("is the hub's own zone while none is saved", async () => {
    readConfigCached.mockResolvedValue({ settings: {} });
    expect(await householdTimezone()).toBe(hubTimezone());
    expect(hubTimezone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    readConfigCached.mockResolvedValue({ settings: { timezone: 'Pacific/Kiritimati' } });
    expect(await householdTimezone()).toBe('Pacific/Kiritimati');
  });

  it('falls back to the machine\'s clock without a readable setting', async () => {
    readConfigCached.mockRejectedValue(new Error('unreadable'));
    const d = new Date(now);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(await householdToday(now)).toBe(local);
  });
});

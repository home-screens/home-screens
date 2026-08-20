import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('tsdav', () => ({
  createDAVClient: vi.fn(),
}));

import { createDAVClient } from 'tsdav';
import {
  listICloudCalendars,
  checkICloudBirthdaysAvailable,
  fetchICloudEvents,
  normalizeAppleColor,
  parseVCardBirthday,
  clearBirthdayCache,
} from '@/lib/caldav-calendar';
import type { ICloudAccount } from '@/lib/icloud-accounts';
import type { ICloudSource } from '@/types/config';

const mockCreateClient = vi.mocked(createDAVClient);

const ACCOUNT: ICloudAccount = { id: 'acct-1', appleId: 'a@icloud.com', appPassword: 'aaaa-bbbb-cccc-dddd' };

const TIME_MIN = '2026-07-01T00:00:00.000Z';
const TIME_MAX = '2026-08-01T00:00:00.000Z';

function calendarSource(overrides: Partial<ICloudSource> = {}): ICloudSource {
  return {
    id: 'src-1',
    accountId: 'acct-1',
    kind: 'calendar',
    url: 'https://caldav.icloud.com/123/calendars/home/',
    name: 'Home',
    color: '#ef4444',
    enabled: true,
    ...overrides,
  };
}

function icsEvent(uid: string, dtStart: string, dtEnd: string, summary: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260701T000000Z',
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

type MockClient = {
  fetchCalendars: ReturnType<typeof vi.fn>;
  fetchCalendarObjects: ReturnType<typeof vi.fn>;
  fetchAddressBooks: ReturnType<typeof vi.fn>;
  fetchVCards: ReturnType<typeof vi.fn>;
};

function mockClient(overrides: Partial<MockClient> = {}): MockClient {
  return {
    fetchCalendars: vi.fn().mockResolvedValue([]),
    fetchCalendarObjects: vi.fn().mockResolvedValue([]),
    fetchAddressBooks: vi.fn().mockResolvedValue([]),
    fetchVCards: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function installClients(caldav: MockClient, carddav: MockClient = mockClient()) {
  mockCreateClient.mockImplementation(async (opts) =>
    ((opts as { defaultAccountType?: string }).defaultAccountType === 'carddav' ? carddav : caldav) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBirthdayCache();
});

describe('normalizeAppleColor', () => {
  it('strips the alpha channel from Apple #RRGGBBAA colors', () => {
    expect(normalizeAppleColor('#FF2D55FF')).toBe('#FF2D55');
  });

  it('passes through #RRGGBB and #RGB', () => {
    expect(normalizeAppleColor('#3b82f6')).toBe('#3b82f6');
    expect(normalizeAppleColor('#abc')).toBe('#abc');
  });

  it('rejects anything else', () => {
    expect(normalizeAppleColor('red')).toBeNull();
    expect(normalizeAppleColor(undefined)).toBeNull();
    expect(normalizeAppleColor({})).toBeNull();
  });
});

describe('parseVCardBirthday', () => {
  const card = (lines: string[]) =>
    ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');

  it('parses a full date', () => {
    expect(parseVCardBirthday(card(['FN:Alice', 'BDAY:1985-07-20'])))
      .toEqual({ name: 'Alice', month: 7, day: 20 });
  });

  it('parses the compact format', () => {
    expect(parseVCardBirthday(card(['FN:Bob', 'BDAY:19850720'])))
      .toEqual({ name: 'Bob', month: 7, day: 20 });
  });

  it('parses year-omitted forms', () => {
    expect(parseVCardBirthday(card(['FN:Cara', 'BDAY:--07-20'])))
      .toEqual({ name: 'Cara', month: 7, day: 20 });
    expect(parseVCardBirthday(card(['FN:Dan', 'BDAY:--0720'])))
      .toEqual({ name: 'Dan', month: 7, day: 20 });
  });

  it("parses Apple's 1604 omit-year convention with params", () => {
    expect(parseVCardBirthday(card(['FN:Eve', 'BDAY;X-APPLE-OMIT-YEAR=1604:1604-07-20'])))
      .toEqual({ name: 'Eve', month: 7, day: 20 });
  });

  it('unfolds wrapped lines', () => {
    const folded = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Somebody With A Very\r\n  Long Name\r\nBDAY:2000-01-02\r\nEND:VCARD';
    expect(parseVCardBirthday(folded)).toEqual({ name: 'Somebody With A Very Long Name', month: 1, day: 2 });
  });

  it('returns null without FN or BDAY, or with an invalid date', () => {
    expect(parseVCardBirthday(card(['FN:NoBday']))).toBeNull();
    expect(parseVCardBirthday(card(['BDAY:1985-07-20']))).toBeNull();
    expect(parseVCardBirthday(card(['FN:Bad', 'BDAY:1985-13-40']))).toBeNull();
    expect(parseVCardBirthday(card(['FN:Bad', 'BDAY:someday']))).toBeNull();
  });
});

describe('listICloudCalendars', () => {
  it('returns VEVENT calendars with normalized colors', async () => {
    installClients(mockClient({
      fetchCalendars: vi.fn().mockResolvedValue([
        { url: 'https://caldav.icloud.com/c/home/', displayName: 'Home', components: ['VEVENT'], calendarColor: '#FF2D55FF' },
        { url: 'https://caldav.icloud.com/c/reminders/', displayName: 'Reminders', components: ['VTODO'] },
        { url: 'https://caldav.icloud.com/c/unnamed/', displayName: {}, components: ['VEVENT'] },
      ]),
    }));

    const calendars = await listICloudCalendars(ACCOUNT);
    expect(calendars).toEqual([
      { url: 'https://caldav.icloud.com/c/home/', name: 'Home', color: '#FF2D55' },
      { url: 'https://caldav.icloud.com/c/unnamed/', name: 'Calendar', color: null },
    ]);
  });

  it('propagates login failures', async () => {
    mockCreateClient.mockRejectedValue(new Error('Invalid credentials'));
    await expect(listICloudCalendars(ACCOUNT)).rejects.toThrow('Invalid credentials');
  });
});

describe('checkICloudBirthdaysAvailable', () => {
  it('is true when the account has address books', async () => {
    installClients(mockClient(), mockClient({
      fetchAddressBooks: vi.fn().mockResolvedValue([{ url: 'book-1' }]),
    }));
    expect(await checkICloudBirthdaysAvailable(ACCOUNT)).toBe(true);
  });

  it('is false when the account has no address books', async () => {
    installClients(mockClient(), mockClient());
    expect(await checkICloudBirthdaysAvailable(ACCOUNT)).toBe(false);
  });

  it('is false when contacts access fails', async () => {
    mockCreateClient.mockRejectedValue(new Error('403'));
    expect(await checkICloudBirthdaysAvailable(ACCOUNT)).toBe(false);
  });
});

describe('withTimeout', () => {
  it('rejects a hung CalDAV call at the deadline and aborts its socket', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      installClients(mockClient({
        fetchCalendars: vi.fn().mockImplementation(({ fetchOptions }: { fetchOptions?: RequestInit }) => {
          signal = fetchOptions?.signal ?? undefined;
          return new Promise(() => {}); // never settles — a wedged socket
        }),
      }));

      const promise = listICloudCalendars(ACCOUNT);
      const assertion = expect(promise).rejects.toThrow('iCloud calendar list timed out');
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchICloudEvents', () => {
  it('fetches and parses events within the window', async () => {
    const caldav = mockClient({
      fetchCalendarObjects: vi.fn().mockResolvedValue([
        { url: 'e1.ics', etag: '"1"', data: icsEvent('evt-1', '20260715T170000Z', '20260715T180000Z', 'Dentist') },
      ]),
    });
    installClients(caldav);

    const { events } = await fetchICloudEvents([calendarSource()], [ACCOUNT], TIME_MIN, TIME_MAX);

    expect(caldav.fetchCalendarObjects).toHaveBeenCalledWith(expect.objectContaining({
      calendar: expect.objectContaining({ url: 'https://caldav.icloud.com/123/calendars/home/' }),
      timeRange: { start: TIME_MIN, end: TIME_MAX },
    }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Dentist',
      allDay: false,
      calendarColor: '#ef4444',
      sourceId: 'src-1',
      sourceName: 'Home',
    });
    expect(events[0].start).toBe('2026-07-15T17:00:00.000Z');
  });

  it('drops events outside the window', async () => {
    installClients(mockClient({
      fetchCalendarObjects: vi.fn().mockResolvedValue([
        { url: 'e2.ics', etag: '"1"', data: icsEvent('evt-2', '20261225T170000Z', '20261225T180000Z', 'Too far out') },
      ]),
    }));

    const { events } = await fetchICloudEvents([calendarSource()], [ACCOUNT], TIME_MIN, TIME_MAX);
    expect(events).toEqual([]);
  });

  it('one failing calendar does not blank the others', async () => {
    const good = calendarSource();
    const bad = calendarSource({ id: 'src-2', url: 'https://caldav.icloud.com/123/calendars/broken/', name: 'Broken' });
    installClients(mockClient({
      fetchCalendarObjects: vi.fn().mockImplementation(async ({ calendar }: { calendar: { url: string } }) => {
        if (calendar.url === bad.url) throw new Error('500');
        return [{ url: 'e1.ics', etag: '"1"', data: icsEvent('evt-1', '20260715T170000Z', '20260715T180000Z', 'Dentist') }];
      }),
    }));

    const { events } = await fetchICloudEvents([good, bad], [ACCOUNT], TIME_MIN, TIME_MAX);
    expect(events.map((e) => e.title)).toEqual(['Dentist']);
  });

  it('skips calendar sources whose URL is not an iCloud https address', async () => {
    const caldav = mockClient();
    installClients(caldav);

    const { events } = await fetchICloudEvents(
      [
        calendarSource({ id: 'src-evil', url: 'https://evil.example.com/steal-credentials/' }),
        calendarSource({ id: 'src-http', url: 'http://caldav.icloud.com/123/calendars/home/' }),
        calendarSource({ id: 'src-junk', url: 'not a url' }),
      ],
      [ACCOUNT],
      TIME_MIN,
      TIME_MAX,
    );

    expect(events).toEqual([]);
    expect(caldav.fetchCalendarObjects).not.toHaveBeenCalled();
  });

  it('skips sources whose account is gone', async () => {
    installClients(mockClient());
    const { events } = await fetchICloudEvents(
      [calendarSource({ accountId: 'gone' })],
      [ACCOUNT],
      TIME_MIN,
      TIME_MAX,
    );
    expect(events).toEqual([]);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('builds all-day birthday events from contacts', async () => {
    const source = calendarSource({ id: 'src-b', kind: 'birthdays', url: '', name: 'Birthdays', color: '#a855f7' });
    installClients(mockClient(), mockClient({
      fetchAddressBooks: vi.fn().mockResolvedValue([{ url: 'book-1' }]),
      fetchVCards: vi.fn().mockResolvedValue([
        { url: 'alice.vcf', etag: '"1"', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Alice\r\nBDAY:1985-07-20\r\nEND:VCARD' },
        { url: 'nobday.vcf', etag: '"1"', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:No Birthday\r\nEND:VCARD' },
        { url: 'december.vcf', etag: '"1"', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:December Kid\r\nBDAY:--1225\r\nEND:VCARD' },
      ]),
    }));

    const { events } = await fetchICloudEvents([source], [ACCOUNT], TIME_MIN, TIME_MAX);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: '🎂 Alice',
      allDay: true,
      start: '2026-07-20',
      end: '2026-07-21',
      calendarColor: '#a855f7',
      sourceId: 'src-b',
      sourceName: 'Birthdays',
    });
  });

  it('reuses the parsed birthday list for the rest of the day instead of refetching contacts', async () => {
    const source = calendarSource({ id: 'src-b', kind: 'birthdays', url: '', name: 'Birthdays' });
    const carddav = mockClient({
      fetchAddressBooks: vi.fn().mockResolvedValue([{ url: 'book-1' }]),
      fetchVCards: vi.fn().mockResolvedValue([
        { url: 'alice.vcf', etag: '"1"', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Alice\r\nBDAY:1985-07-20\r\nEND:VCARD' },
      ]),
    });
    installClients(mockClient(), carddav);

    const { events: first } = await fetchICloudEvents([source], [ACCOUNT], TIME_MIN, TIME_MAX);
    const { events: second } = await fetchICloudEvents([source], [ACCOUNT], TIME_MIN, TIME_MAX);

    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    // The whole CardDAV pipeline (login + books + vCards) ran exactly once.
    expect(carddav.fetchVCards).toHaveBeenCalledTimes(1);
    expect(carddav.fetchAddressBooks).toHaveBeenCalledTimes(1);
  });

  it('does not cache the birthday list when the contacts fetch fails', async () => {
    const source = calendarSource({ id: 'src-b', kind: 'birthdays', url: '', name: 'Birthdays' });
    const carddav = mockClient({
      fetchAddressBooks: vi.fn()
        .mockRejectedValueOnce(new Error('503'))
        .mockResolvedValueOnce([{ url: 'book-1' }]),
      fetchVCards: vi.fn().mockResolvedValue([
        { url: 'alice.vcf', etag: '"1"', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Alice\r\nBDAY:1985-07-20\r\nEND:VCARD' },
      ]),
    });
    installClients(mockClient(), carddav);

    const { events: first } = await fetchICloudEvents([source], [ACCOUNT], TIME_MIN, TIME_MAX);
    expect(first).toEqual([]); // failed fetch degrades to no events

    const { events: second } = await fetchICloudEvents([source], [ACCOUNT], TIME_MIN, TIME_MAX);
    expect(second).toHaveLength(1); // retried, not served from a cached failure
  });

  it('emits one occurrence per year across a multi-year window', async () => {
    const source = calendarSource({ id: 'src-b', kind: 'birthdays', url: '', name: 'Birthdays' });
    installClients(mockClient(), mockClient({
      fetchAddressBooks: vi.fn().mockResolvedValue([{ url: 'book-1' }]),
      fetchVCards: vi.fn().mockResolvedValue([
        { url: 'alice.vcf', etag: '"1"', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Alice\r\nBDAY:1985-07-20\r\nEND:VCARD' },
      ]),
    }));

    const { events } = await fetchICloudEvents(
      [source], [ACCOUNT],
      new Date(2026, 5, 1).toISOString(),
      new Date(2028, 5, 1).toISOString(),
    );

    expect(events.map((e) => e.start)).toEqual(['2026-07-20', '2027-07-20']);
  });

  it('rolls a Feb 29 birthday forward to Mar 1 in non-leap years', async () => {
    const source = calendarSource({ id: 'src-b', kind: 'birthdays', url: '', name: 'Birthdays' });
    installClients(mockClient(), mockClient({
      fetchAddressBooks: vi.fn().mockResolvedValue([{ url: 'book-1' }]),
      fetchVCards: vi.fn().mockResolvedValue([
        { url: 'leap.vcf', etag: '"1"', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Leap Kid\r\nBDAY:--0229\r\nEND:VCARD' },
      ]),
    }));

    const { events } = await fetchICloudEvents(
      [source], [ACCOUNT],
      new Date(2027, 1, 1).toISOString(),
      new Date(2027, 3, 1).toISOString(),
    );

    expect(events.map((e) => e.start)).toEqual(['2027-03-01']);
  });

  it('applies half-open window boundaries to birthday days', async () => {
    const source = calendarSource({ id: 'src-b', kind: 'birthdays', url: '', name: 'Birthdays' });
    const carddav = () => mockClient({
      fetchAddressBooks: vi.fn().mockResolvedValue([{ url: 'book-1' }]),
      fetchVCards: vi.fn().mockResolvedValue([
        { url: 'alice.vcf', etag: '"1"', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Alice\r\nBDAY:1985-07-20\r\nEND:VCARD' },
      ]),
    });

    // Window starting mid-way through the birthday's local day still shows it
    installClients(mockClient(), carddav());
    const { events: overlapping } = await fetchICloudEvents(
      [source], [ACCOUNT],
      new Date(2026, 6, 20, 12, 0).toISOString(),
      new Date(2026, 6, 25).toISOString(),
    );
    expect(overlapping.map((e) => e.start)).toEqual(['2026-07-20']);

    // Window ending exactly at the birthday's local midnight excludes it
    clearBirthdayCache();
    installClients(mockClient(), carddav());
    const { events: excluded } = await fetchICloudEvents(
      [source], [ACCOUNT],
      new Date(2026, 6, 15).toISOString(),
      new Date(2026, 6, 20).toISOString(),
    );
    expect(excluded).toEqual([]);
  });

  it('mixes calendar and birthday sources for one account', async () => {
    installClients(
      mockClient({
        fetchCalendarObjects: vi.fn().mockResolvedValue([
          { url: 'e1.ics', etag: '"1"', data: icsEvent('evt-1', '20260715T170000Z', '20260715T180000Z', 'Dentist') },
        ]),
      }),
      mockClient({
        fetchAddressBooks: vi.fn().mockResolvedValue([{ url: 'book-1' }]),
        fetchVCards: vi.fn().mockResolvedValue([
          { url: 'alice.vcf', etag: '"1"', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Alice\r\nBDAY:1985-07-10\r\nEND:VCARD' },
        ]),
      }),
    );

    const { events } = await fetchICloudEvents(
      [calendarSource(), calendarSource({ id: 'src-b', kind: 'birthdays', url: '', name: 'Birthdays' })],
      [ACCOUNT],
      TIME_MIN,
      TIME_MAX,
    );

    // Sorted by start: birthday (Jul 10) before dentist (Jul 15)
    expect(events.map((e) => e.title)).toEqual(['🎂 Alice', 'Dentist']);
  });
});

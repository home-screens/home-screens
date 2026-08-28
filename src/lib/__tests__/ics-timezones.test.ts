import { describe, it, expect } from 'vitest';
import { normalizeIcsTimezones } from '@/lib/ics-timezones';

function calendar(body: string): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', body, 'END:VCALENDAR'].join('\r\n');
}

function event(tzid: string, uid = 'e1'): string {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260801T120000Z',
    `DTSTART;TZID=${tzid}:20260810T090000`,
    `DTEND;TZID=${tzid}:20260810T100000`,
    'SUMMARY:Test',
    'END:VEVENT',
  ].join('\r\n');
}

/** A VTIMEZONE that declares real DST rules (northern hemisphere unless told otherwise). */
function dstVtimezone(tzid: string, standard: string, daylight: string, northern = true): string {
  return [
    'BEGIN:VTIMEZONE',
    `TZID:${tzid}`,
    'BEGIN:STANDARD',
    northern ? 'DTSTART:19701101T020000' : 'DTSTART:19700405T030000',
    `RRULE:FREQ=YEARLY;BYMONTH=${northern ? 11 : 4};BYDAY=1SU`,
    `TZOFFSETFROM:${daylight}`,
    `TZOFFSETTO:${standard}`,
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    northern ? 'DTSTART:19700308T020000' : 'DTSTART:19700906T020000',
    `RRULE:FREQ=YEARLY;BYMONTH=${northern ? 3 : 9};BYDAY=${northern ? '2SU' : '1SU'}`,
    `TZOFFSETFROM:${standard}`,
    `TZOFFSETTO:${daylight}`,
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ].join('\r\n');
}

describe('normalizeIcsTimezones', () => {
  it('leaves a well-formed feed byte-for-byte unchanged', () => {
    const ics = calendar(event('America/Edmonton'));
    const { text, replacements } = normalizeIcsTimezones(ics);
    expect(text).toBe(ics);
    expect(replacements.size).toBe(0);
  });

  it('rewrites North American abbreviations to their fixed offset', () => {
    const { text, replacements } = normalizeIcsTimezones(calendar(event('CST')));
    expect(replacements.get('CST')).toBe('UTC-0600');
    expect(text).toContain('DTSTART;TZID=UTC-0600:20260810T090000');
  });

  it('rewrites daylight abbreviations ICU rejects outright', () => {
    const { replacements } = normalizeIcsTimezones(calendar([event('MDT', 'a'), event('EDT', 'b')].join('\r\n')));
    expect(replacements.get('MDT')).toBe('UTC-0600');
    expect(replacements.get('EDT')).toBe('UTC-0400');
  });

  it('handles half-hour offsets so Newfoundland feeds survive', () => {
    const { replacements } = normalizeIcsTimezones(calendar([event('NST', 'a'), event('NDT', 'b')].join('\r\n')));
    expect(replacements.get('NST')).toBe('UTC-0330');
    expect(replacements.get('NDT')).toBe('UTC-0230');
  });

  it('prefers the offset declared by the document over the abbreviation', () => {
    // "CST" here means China Standard Time, and the feed says so.
    const ics = calendar(
      [
        'BEGIN:VTIMEZONE',
        'TZID:CST',
        'BEGIN:STANDARD',
        'DTSTART:19700101T000000',
        'TZOFFSETFROM:+0800',
        'TZOFFSETTO:+0800',
        'END:STANDARD',
        'END:VTIMEZONE',
        event('CST'),
      ].join('\r\n'),
    );
    const { text, replacements } = normalizeIcsTimezones(ics);
    expect(replacements.get('CST')).toBe('UTC+0800');
    expect(text).toContain('TZID:UTC+0800');
  });

  it('resolves to a real zone when a VTIMEZONE carries real DST rules', () => {
    const ics = calendar([dstVtimezone('CST', '-0600', '-0500'), event('CST')].join('\r\n'));
    expect(normalizeIcsTimezones(ics, 2026).replacements.get('CST')).toBe('America/Chicago');
  });

  it('drops a zone it cannot resolve instead of leaving an unusable name behind', () => {
    const { text, replacements } = normalizeIcsTimezones(calendar(event('BST')));
    expect(replacements.get('BST')).toBeNull();
    expect(text).not.toContain('BST');
    expect(text).toContain('DTSTART:20260810T090000');
  });

  it('uses a declared offset for a custom name with no abbreviation meaning', () => {
    const ics = calendar(
      [
        'BEGIN:VTIMEZONE',
        'TZID:XYZ',
        'BEGIN:STANDARD',
        'TZOFFSETFROM:+0545',
        'TZOFFSETTO:+0545',
        'END:STANDARD',
        'END:VTIMEZONE',
        event('XYZ'),
      ].join('\r\n'),
    );
    expect(normalizeIcsTimezones(ics).replacements.get('XYZ')).toBe('UTC+0545');
  });

  it('leaves short tzdb zone names alone', () => {
    for (const zone of ['UTC', 'GMT', 'EST', 'MST', 'HST', 'CET', 'Japan']) {
      const ics = calendar(event(zone));
      expect(normalizeIcsTimezones(ics).text, zone).toBe(ics);
    }
  });

  it('handles quoted TZID parameters', () => {
    const ics = calendar(event('"CST"'));
    const { text } = normalizeIcsTimezones(ics);
    expect(text).toContain('DTSTART;TZID=UTC-0600:20260810T090000');
  });

  it('rewrites every occurrence of a repeated zone', () => {
    const ics = calendar([event('MDT', 'a'), event('MDT', 'b')].join('\r\n'));
    const { text } = normalizeIcsTimezones(ics);
    expect(text).not.toContain('TZID=MDT');
    expect(text.match(/TZID=UTC-0600/g)).toHaveLength(4);
  });

  describe('leaves everything it should not touch alone', () => {
    // Any of these being rewritten would be a regression: they are either real zone
    // identifiers or shapes node-ical already has its own handling for.
    const UNTOUCHED = [
      'America/Edmonton', 'America/St_Johns', 'US/Central', 'Canada/Mountain',
      'Asia/Calcutta', 'Etc/GMT+6', 'Etc/UTC',
      'UTC', 'GMT', 'EST', 'MST', 'HST', 'CET', 'EET', 'MET', 'WET',
      'Japan', 'Israel', 'Poland',
      'EST5EDT', 'CST6CDT', 'MST7MDT', 'PST8PDT',
      'W. Europe Standard Time', '(UTC-06:00) Central America',
      'Customized Time Zone', 'tzone://Microsoft/Custom',
    ];

    it.each(UNTOUCHED)('leaves %s unchanged', (zone) => {
      const ics = calendar(event(zone));
      const { text, replacements } = normalizeIcsTimezones(ics);
      expect(text).toBe(ics);
      expect(replacements.size).toBe(0);
    });
  });

  describe('covers every zone ID temporal-polyfill forbids', () => {
    // node-ical hands these to Temporal, which throws and takes the whole feed down.
    // Whatever we resolve them to, none may be left in place.
    const FORBIDDEN = [
      'ACT', 'AET', 'AGT', 'ART', 'AST', 'BET', 'BST', 'CAT', 'CNT', 'CST', 'CTT',
      'EAT', 'ECT', 'IET', 'IST', 'JST', 'MIT', 'NET', 'NST', 'PLT', 'PNT', 'PRT',
      'PST', 'SST', 'VST',
    ];

    it.each(FORBIDDEN)('neutralises %s', (zone) => {
      const { text, replacements } = normalizeIcsTimezones(calendar(event(zone)));
      expect(replacements.has(zone)).toBe(true);
      expect(text).not.toContain(`TZID=${zone}`);
    });
  });

  describe('awkward but legal ICS shapes', () => {
    it('sees a TZID split across a folded line', () => {
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:e1',
        'DTSTART;VALUE=DATE-TIME;X-PAD=012345678901234567890123456789;TZ',
        ' ID=CST:20260810T090000',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const { text, replacements } = normalizeIcsTimezones(ics);
      expect(replacements.get('CST')).toBe('UTC-0600');
      expect(text).toContain('TZID=UTC-0600:20260810T090000');
    });

    it('handles a TZID that is not the last parameter', () => {
      const ics = calendar(
        ['BEGIN:VEVENT', 'UID:e1', 'DTSTART;TZID=CST;VALUE=DATE:20260810', 'END:VEVENT'].join('\r\n'),
      );
      expect(normalizeIcsTimezones(ics).text).toContain('DTSTART;TZID=UTC-0600;VALUE=DATE:20260810');
    });

    it('rewrites TZIDs on EXDATE and RECURRENCE-ID too', () => {
      const ics = calendar(
        [
          'BEGIN:VEVENT',
          'UID:e1',
          'DTSTART;TZID=CST:20260810T090000',
          'RRULE:FREQ=WEEKLY;COUNT=3',
          'EXDATE;TZID=CST:20260817T090000',
          'RECURRENCE-ID;TZID=CST;RANGE=THISANDFUTURE:20260824T090000',
          'END:VEVENT',
        ].join('\r\n'),
      );
      const { text } = normalizeIcsTimezones(ics);
      expect(text).not.toContain('TZID=CST');
      expect(text.match(/TZID=UTC-0600/g)).toHaveLength(3);
    });
  });
  describe('VTIMEZONE blocks that declare daylight saving', () => {
    it('picks the zone the abbreviation names when the offsets agree', () => {
      const cases: Array<[string, string, string, string]> = [
        ['CST', '-0600', '-0500', 'America/Chicago'],
        ['MDT', '-0700', '-0600', 'America/Denver'],
        ['PST', '-0800', '-0700', 'America/Los_Angeles'],
        ['AST', '-0400', '-0300', 'America/Halifax'],
        ['NST', '-0330', '-0230', 'America/St_Johns'],
        ['AKST', '-0900', '-0800', 'America/Anchorage'],
        ['EDT', '-0500', '-0400', 'America/New_York'],
        ['CEST', '+0100', '+0200', 'Europe/Paris'],
      ];
      for (const [abbrev, std, dst, expected] of cases) {
        const ics = calendar([dstVtimezone(abbrev, std, dst), event(abbrev)].join('\r\n'));
        expect(normalizeIcsTimezones(ics, 2026).replacements.get(abbrev), abbrev).toBe(expected);
      }
    });

    it('ignores the abbreviation when the declared offsets contradict it', () => {
      // Says CST, but declares Central European offsets. The document wins.
      const ics = calendar([dstVtimezone('CST', '+0100', '+0200'), event('CST')].join('\r\n'));
      const zone = normalizeIcsTimezones(ics, 2026).replacements.get('CST');
      expect(zone).not.toBe('America/Chicago');
      expect(zone).toMatch(/^[A-Za-z]+\//);
    });

    it('resolves a name it has never heard of from the declared offsets alone', () => {
      const ics = calendar([dstVtimezone('XYZ', '-0600', '-0500'), event('XYZ')].join('\r\n'));
      const zone = normalizeIcsTimezones(ics, 2026).replacements.get('XYZ')!;
      expect(zone).toMatch(/^America\//);
      // Whatever zone it picked must genuinely have those offsets.
      const offset = (month: number) => new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
        .formatToParts(new Date(Date.UTC(2026, month, 15))).find((p) => p.type === 'timeZoneName')?.value;
      expect(offset(0)).toBe('GMT-06:00');
      expect(offset(6)).toBe('GMT-05:00');
    });

    it('uses the daylight start month to tell the hemispheres apart', () => {
      // -04:00/-03:00 fits both Halifax (northern) and Santiago (southern).
      const north = calendar([dstVtimezone('QQQ', '-0400', '-0300', true), event('QQQ')].join('\r\n'));
      const south = calendar([dstVtimezone('QQQ', '-0400', '-0300', false), event('QQQ')].join('\r\n'));
      const northZone = normalizeIcsTimezones(north, 2026).replacements.get('QQQ')!;
      const southZone = normalizeIcsTimezones(south, 2026).replacements.get('QQQ')!;
      expect(northZone).not.toBe(southZone);

      const isDstInJuly = (zone: string) => new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
        .formatToParts(new Date(Date.UTC(2026, 6, 15))).find((p) => p.type === 'timeZoneName')?.value === 'GMT-03:00';
      expect(isDstInJuly(northZone)).toBe(true);
      expect(isDstInJuly(southZone)).toBe(false);
    });

    it('still falls back to a fixed offset when no zone matches', () => {
      // No real zone runs a 45-minute DST shift off a -06:00 base.
      const ics = calendar([dstVtimezone('ZZZ', '-0600', '-0515'), event('ZZZ')].join('\r\n'));
      expect(normalizeIcsTimezones(ics, 2026).replacements.get('ZZZ')).toBe('UTC-0600');
    });

    it('keeps using a fixed offset when the VTIMEZONE declares only one', () => {
      const ics = calendar(
        [
          'BEGIN:VTIMEZONE',
          'TZID:MDT',
          'BEGIN:STANDARD',
          'DTSTART:19700101T000000',
          'TZOFFSETFROM:-0600',
          'TZOFFSETTO:-0600',
          'END:STANDARD',
          'END:VTIMEZONE',
          event('MDT'),
        ].join('\r\n'),
      );
      expect(normalizeIcsTimezones(ics, 2026).replacements.get('MDT')).toBe('UTC-0600');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { adoptICloudSources, icloudSourceId, orphanedICloudSources, withICloudSource } from '@/lib/icloud-source-id';
import { withSavedEvents } from '@/lib/calendar-source-status';
import type { CalendarEvent, ICloudSource } from '@/types/config';

const HOME = 'https://caldav.icloud.com/1234/calendars/home/';
const WORK = 'https://caldav.icloud.com/1234/calendars/work/';

describe('icloudSourceId', () => {
  it('is the same every time one calendar is ticked, whatever case the Apple ID is typed in', () => {
    expect(icloudSourceId('alex@icloud.com', 'calendar', HOME)).toBe(icloudSourceId('alex@icloud.com', 'calendar', HOME));
    expect(icloudSourceId(' Alex@iCloud.com', 'calendar', HOME)).toBe(icloudSourceId('alex@icloud.com', 'calendar', HOME));
    expect(icloudSourceId('alex@icloud.com', 'calendar', HOME)).toMatch(/^icloud-[0-9a-f]{16}$/);
  });

  it('tells calendars, accounts and the birthdays list apart', () => {
    const ids = new Set([
      icloudSourceId('alex@icloud.com', 'calendar', HOME),
      icloudSourceId('alex@icloud.com', 'calendar', WORK),
      icloudSourceId('sam@icloud.com', 'calendar', HOME),
      icloudSourceId('alex@icloud.com', 'birthdays', ''),
      icloudSourceId('sam@icloud.com', 'birthdays', ''),
    ]);
    expect(ids.size).toBe(5);
  });
});

const src = (accountId: string, url: string, id = icloudSourceId('alex@icloud.com', 'calendar', url)): ICloudSource =>
  ({ id, accountId, kind: 'calendar', url, name: url, color: '#123456', enabled: true });

describe('withICloudSource', () => {
  it('puts a calendar where its account\'s list has it', () => {
    const work = src('acct', WORK);
    expect(withICloudSource([work], src('acct', HOME), [HOME, WORK]).map((s) => s.url)).toEqual([HOME, WORK]);
  });

  /* Alex's account was removed and added again; ticking Home saved it twice and every event showed double. */
  it('takes over a calendar already saved under the same id instead of saving it twice', () => {
    const left = src('acct-old', HOME);
    const other = src('acct-old', WORK, 'random-id');
    const again = src('acct-new', HOME);
    expect(again.id).toBe(left.id);
    const saved = withICloudSource([left, other], again, [HOME, WORK]);
    expect(saved).toEqual([other, again]);
  });

  it('is what keeps that calendar\'s events from showing twice on the wall', () => {
    const left = src('acct-old', HOME);
    const again = src('acct-new', HOME);
    const event = { id: 'e1', title: 'Swim', start: '2026-07-15T09:00:00', end: '2026-07-15T10:00:00', sourceId: again.id } as CalendarEvent;
    // What the hub's calendar read does with each saved source: the one whose
    // account is gone fails, and a failed source gets its saved events added.
    const onTheWall = (sources: ICloudSource[]) => {
      const results = sources.map((s) => ({ id: s.id, name: s.name, ok: s.accountId === 'acct-new' }));
      const read = () => withSavedEvents([event], results, new Date(2026, 6, 1), new Date(2026, 7, 1));
      read();
      return read().length;
    };
    expect(onTheWall(withICloudSource([left], again, [HOME]))).toBe(1);
    // Kept side by side, as a plain insert did.
    expect(onTheWall([left, again])).toBe(2);
  });
});

describe('adoptICloudSources', () => {
  it('hands an Apple ID added again the calendars saved under its old account', () => {
    const sources = [src('acct-old', HOME), src('acct-old', WORK), src('acct-sam', HOME, icloudSourceId('sam@icloud.com', 'calendar', HOME))];
    const adopted = adoptICloudSources(sources, { id: 'acct-new', appleId: 'Alex@iCloud.com' });
    expect(adopted.map((s) => s.accountId)).toEqual(['acct-new', 'acct-new', 'acct-sam']);
    expect(adopted.map((s) => s.id)).toEqual(sources.map((s) => s.id));
  });

  it('answers the same list when nothing is the account\'s to take, random ids included', () => {
    const sources = [src('acct-old', HOME, 'random-id'), src('acct-new', WORK)];
    expect(adoptICloudSources(sources, { id: 'acct-new', appleId: 'alex@icloud.com' })).toBe(sources);
  });
});

describe('orphanedICloudSources', () => {
  it('names the calendars whose account is gone', () => {
    const gone = src('acct-old', HOME);
    expect(orphanedICloudSources([gone, src('acct-new', WORK)], ['acct-new'])).toEqual([gone]);
    expect(orphanedICloudSources([src('acct-new', WORK)], ['acct-new'])).toEqual([]);
  });
});

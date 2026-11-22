import { describe, it, expect } from 'vitest';
import { icloudSourceId } from '@/lib/icloud-source-id';

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

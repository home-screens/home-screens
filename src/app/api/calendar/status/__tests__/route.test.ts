import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/calendar/status/route';
import { recordSourceStatus } from '@/lib/calendar-source-status';

describe('/api/calendar/status', () => {
  it('returns the latest recorded per-source status (empty before any fetch)', async () => {
    recordSourceStatus([]);
    let body = await (await GET()).json();
    expect(body.sourceStatus).toEqual([]);

    const status = [{ id: 'school', name: 'School', ok: false, error: 'Could not reach the link (HTTP 404)', fetchedAt: null }];
    recordSourceStatus(status);
    body = await (await GET()).json();
    expect(body.sourceStatus).toEqual(status);
  });
});

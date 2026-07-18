import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/caldav-calendar', () => ({
  listICloudCalendars: vi.fn(),
  checkICloudBirthdaysAvailable: vi.fn(),
}));

import { listICloudCalendars, checkICloudBirthdaysAvailable } from '@/lib/caldav-calendar';
import { addICloudAccount } from '@/lib/icloud-accounts';
import { GET } from '@/app/api/icloud/calendars/route';

const mockListCalendars = vi.mocked(listICloudCalendars);
const mockBirthdays = vi.mocked(checkICloudBirthdaysAvailable);

function req(query = '') {
  return new NextRequest(`http://localhost/api/icloud/calendars${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListCalendars.mockResolvedValue([
    { url: 'https://caldav.icloud.com/c/home/', name: 'Home', color: '#FF2D55' },
  ]);
  mockBirthdays.mockResolvedValue(true);
});

describe('GET /api/icloud/calendars', () => {
  it('requires an account parameter', async () => {
    const res = await GET(req());
    expect(res.status).toBe(400);
  });

  it('404s for an unknown account', async () => {
    const res = await GET(req('?account=nope'));
    expect(res.status).toBe(404);
  });

  it('returns calendars and birthdays availability for a stored account', async () => {
    const account = await addICloudAccount('a@icloud.com', 'aaaa-bbbb-cccc-dddd');

    const res = await GET(req(`?account=${account.id}`));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json).toEqual({
      calendars: [{ url: 'https://caldav.icloud.com/c/home/', name: 'Home', color: '#FF2D55' }],
      birthdaysAvailable: true,
    });
    expect(mockListCalendars).toHaveBeenCalledWith(
      expect.objectContaining({ id: account.id, appleId: 'a@icloud.com' }),
    );
  });

  it('surfaces upstream failures as a 500 with a friendly message', async () => {
    const account = await addICloudAccount('b@icloud.com', 'aaaa-bbbb-cccc-dddd');
    mockListCalendars.mockRejectedValue(new Error('iCloud PROPFIND failed'));

    const res = await GET(req(`?account=${account.id}`));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to load iCloud calendars');
  });
});

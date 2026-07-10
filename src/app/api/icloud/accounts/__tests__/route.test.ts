import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/caldav-calendar', () => ({
  listICloudCalendars: vi.fn(),
}));

import { listICloudCalendars } from '@/lib/caldav-calendar';
import { listICloudAccounts } from '@/lib/icloud-accounts';
import { GET, POST, DELETE } from '@/app/api/icloud/accounts/route';

const mockListCalendars = vi.mocked(listICloudCalendars);

function jsonRequest(method: string, body: unknown) {
  return new NextRequest('http://localhost/api/icloud/accounts', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListCalendars.mockResolvedValue([]);
});

describe('/api/icloud/accounts', () => {
  it('POST validates credentials against iCloud before saving', async () => {
    const res = await POST(jsonRequest('POST', { appleId: 'a@icloud.com', appPassword: 'aaaa-bbbb-cccc-dddd' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.appleId).toBe('a@icloud.com');
    expect(json).not.toHaveProperty('appPassword');

    expect(mockListCalendars).toHaveBeenCalledWith(
      expect.objectContaining({ appleId: 'a@icloud.com', appPassword: 'aaaa-bbbb-cccc-dddd' }),
    );
    const stored = await listICloudAccounts();
    expect(stored).toHaveLength(1);
    expect(stored[0].appPassword).toBe('aaaa-bbbb-cccc-dddd');
  });

  it('GET lists accounts without passwords', async () => {
    const res = await GET(new NextRequest('http://localhost/api/icloud/accounts'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(Object.keys(json[0]).sort()).toEqual(['appleId', 'id']);
  });

  it('POST rejects bad credentials with a friendly 400 and saves nothing', async () => {
    // 400 rather than 401: editorFetch redirects the editor to /login on any
    // 401, which would swallow the friendly message.
    mockListCalendars.mockRejectedValue(new Error('Unauthorized'));
    const res = await POST(jsonRequest('POST', { appleId: 'b@icloud.com', appPassword: 'wrong' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('app password');
    expect((await listICloudAccounts()).some((a) => a.appleId === 'b@icloud.com')).toBe(false);
  });

  it('POST rejects missing fields', async () => {
    const res = await POST(jsonRequest('POST', { appleId: 'a@icloud.com' }));
    expect(res.status).toBe(400);
  });

  it('DELETE removes the account', async () => {
    const [account] = await listICloudAccounts();
    const res = await DELETE(jsonRequest('DELETE', { id: account.id }));
    expect(res.status).toBe(200);
    expect(await listICloudAccounts()).toEqual([]);
  });

  it('DELETE rejects a missing id', async () => {
    const res = await DELETE(jsonRequest('DELETE', {}));
    expect(res.status).toBe(400);
  });
});

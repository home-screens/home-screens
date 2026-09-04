import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/onedrive', async () => {
  // The route branches on `instanceof OneDriveError`, so the mock has to
  // carry the real class, not a stub.
  const actual = await vi.importActual<typeof import('@/lib/onedrive')>('@/lib/onedrive');
  return {
    OneDriveError: actual.OneDriveError,
    startDeviceFlow: vi.fn(),
    pollDeviceFlow: vi.fn(),
    cancelDeviceFlow: vi.fn(),
    onedriveDisconnect: vi.fn(),
  };
});

import { GET, POST, DELETE } from '@/app/api/onedrive/auth/route';
import { startDeviceFlow, pollDeviceFlow, onedriveDisconnect, OneDriveError } from '@/lib/onedrive';

const mockStart = vi.mocked(startDeviceFlow);
const mockPoll = vi.mocked(pollDeviceFlow);
const mockDisconnect = vi.mocked(onedriveDisconnect);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/onedrive/auth', () => {
  it('returns the device code details', async () => {
    mockStart.mockResolvedValue({
      userCode: 'ABC123', verificationUri: 'https://microsoft.com/link',
      intervalMs: 5000, expiresInSeconds: 900,
    });

    const res = await POST(new NextRequest('http://localhost/api/onedrive/auth', { method: 'POST' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userCode: 'ABC123', verificationUri: 'https://microsoft.com/link',
      intervalMs: 5000, expiresInSeconds: 900,
    });
  });

  it('answers a missing Application ID with a code the editor can translate', async () => {
    mockStart.mockRejectedValue(
      new OneDriveError('Add your Microsoft Application ID in Settings, API keys first', 400, 'credentials_missing'),
    );

    const res = await POST(new NextRequest('http://localhost/api/onedrive/auth', { method: 'POST' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('credentials_missing');
    // The sentence stays for curl callers.
    expect(body.error).toContain('Application ID');
  });

  it('lets an unexpected failure be a 500 rather than a 400 carrying a Node message', async () => {
    mockStart.mockRejectedValue(new TypeError('fetch failed'));

    const res = await POST(new NextRequest('http://localhost/api/onedrive/auth', { method: 'POST' }));

    expect(res.status).toBe(500);
    // withAuth's standard shape: a sentence in `error`, the raw cause in `detail`.
    expect(await res.json()).toEqual({ error: 'Could not start Microsoft sign-in', detail: 'fetch failed' });
  });
});

describe('GET /api/onedrive/auth', () => {
  it('passes the poll state through', async () => {
    mockPoll.mockResolvedValue({ state: 'pending' });

    const res = await GET(new NextRequest('http://localhost/api/onedrive/auth'));

    expect(await res.json()).toEqual({ state: 'pending' });
  });

  it('answers 200 with state failed when the poll throws', async () => {
    mockPoll.mockRejectedValue(new Error('network down'));

    const res = await GET(new NextRequest('http://localhost/api/onedrive/auth'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'failed', message: 'network down' });
  });
});

describe('DELETE /api/onedrive/auth', () => {
  it('disconnects and reports not connected', async () => {
    const res = await DELETE(new NextRequest('http://localhost/api/onedrive/auth', { method: 'DELETE' }));

    expect(mockDisconnect).toHaveBeenCalled();
    expect(await res.json()).toEqual({ connected: false });
  });
});

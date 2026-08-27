import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/onedrive', () => ({
  startDeviceFlow: vi.fn(),
  pollDeviceFlow: vi.fn(),
  cancelDeviceFlow: vi.fn(),
  onedriveDisconnect: vi.fn(),
}));

import { GET, POST, DELETE } from '@/app/api/onedrive/auth/route';
import { startDeviceFlow, pollDeviceFlow, onedriveDisconnect } from '@/lib/onedrive';

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

  it('surfaces start failures as 400 with the message', async () => {
    mockStart.mockRejectedValue(new Error('Add your Microsoft Application ID in Settings, API keys first'));

    const res = await POST(new NextRequest('http://localhost/api/onedrive/auth', { method: 'POST' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Application ID');
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

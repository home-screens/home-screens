import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/onedrive', () => ({
  getMicrosoftClientId: vi.fn(),
  onedriveVerifyConnected: vi.fn(),
  getAccount: vi.fn(),
}));

import { GET } from '@/app/api/onedrive/status/route';
import { getMicrosoftClientId, onedriveVerifyConnected, getAccount } from '@/lib/onedrive';

const mockClientId = vi.mocked(getMicrosoftClientId);
const mockVerify = vi.mocked(onedriveVerifyConnected);
const mockAccount = vi.mocked(getAccount);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/onedrive/status', () => {
  it('reports unconfigured without touching the grant', async () => {
    mockClientId.mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost/api/onedrive/status'));
    const json = await res.json();

    expect(json).toEqual({ credentialsConfigured: false, connected: false, account: null });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('reports connected with the account when the grant is live', async () => {
    mockClientId.mockResolvedValue('ms-client-id');
    mockVerify.mockResolvedValue(true);
    mockAccount.mockResolvedValue('family@example.com');

    const json = await (await GET(new NextRequest('http://localhost/api/onedrive/status'))).json();

    expect(json).toEqual({ credentialsConfigured: true, connected: true, account: 'family@example.com' });
  });

  it('reports not connected when the grant is dead, without an account lookup', async () => {
    mockClientId.mockResolvedValue('ms-client-id');
    mockVerify.mockResolvedValue(false);

    const json = await (await GET(new NextRequest('http://localhost/api/onedrive/status'))).json();

    expect(json).toEqual({ credentialsConfigured: true, connected: false, account: null });
    expect(mockAccount).not.toHaveBeenCalled();
  });
});

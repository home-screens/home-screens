import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const mockConnected = vi.fn();
const mockDisconnect = vi.fn();
const mockHasCreds = vi.fn();
vi.mock('@/lib/google-picker', () => ({
  isPickerConnected: (...args: unknown[]) => mockConnected(...args),
  disconnectPicker: (...args: unknown[]) => mockDisconnect(...args),
  hasPickerCredentials: (...args: unknown[]) => mockHasCreds(...args),
}));

function request() {
  return new NextRequest('http://localhost/api/google-picker/status');
}

describe('/api/google-picker/status', () => {
  beforeEach(() => {
    vi.resetModules();
    mockConnected.mockReset();
    mockDisconnect.mockReset();
    mockHasCreds.mockReset();
  });

  async function importRoute() {
    return import('@/app/api/google-picker/status/route');
  }

  it('GET reports connection + credential state', async () => {
    mockConnected.mockResolvedValue(false);
    mockHasCreds.mockResolvedValue(true);
    const { GET } = await importRoute();
    const json = await (await GET(request())).json();
    expect(json).toEqual({ connected: false, credentialsConfigured: true });
  });

  it('DELETE disconnects', async () => {
    mockDisconnect.mockResolvedValue({ stillUsedBy: null });
    const { DELETE } = await importRoute();
    const json = await (await DELETE(request())).json();
    expect(mockDisconnect).toHaveBeenCalledOnce();
    expect(json).toEqual({ connected: false, stillUsedBy: null });
  });

  it('DELETE says when Google Calendar still uses the same Google sign-in', async () => {
    mockDisconnect.mockResolvedValue({ stillUsedBy: 'calendar' });
    const { DELETE } = await importRoute();
    const json = await (await DELETE(request())).json();
    expect(json).toEqual({ connected: false, stillUsedBy: 'calendar' });
  });
});

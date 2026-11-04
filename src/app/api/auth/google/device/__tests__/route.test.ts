import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetupError } from '@/lib/api-utils';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const mockRequestDeviceCode = vi.fn();
vi.mock('@/lib/google-auth', () => ({
  requestDeviceCode: () => mockRequestDeviceCode(),
  pollDeviceToken: vi.fn(),
}));

const mockGetSecret = vi.fn();
vi.mock('@/lib/secrets', () => ({
  getSecret: (key: string) => mockGetSecret(key),
}));

import { POST } from '@/app/api/auth/google/device/route';

beforeEach(() => {
  mockRequestDeviceCode.mockReset();
  mockGetSecret.mockReset();
  mockGetSecret.mockResolvedValue('123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com');
});

describe('POST /api/auth/google/device', () => {
  it('passes the device code through', async () => {
    mockRequestDeviceCode.mockResolvedValue({ device_code: 'd', user_code: 'ABCD-EFGH', verification_url: 'https://google.com/device', expires_in: 1800, interval: 5 });
    const res = await POST(new Request('http://localhost/api/auth/google/device', { method: 'POST' }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).user_code).toBe('ABCD-EFGH');
  });

  it('answers a missing client id as a setup problem, with a masked copy of the saved id', async () => {
    mockRequestDeviceCode.mockRejectedValue(new SetupError('Google Calendar Client ID is not configured.', 'key', 'Google Calendar', 'integrations'));
    const res = await POST(new Request('http://localhost/api/auth/google/device', { method: 'POST' }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Google Calendar Client ID is not configured.', code: 'setup' });
    // Masked: the start and the end, never the whole id.
    expect(body.clientIdHint).toBe('12345678…ps.googleusercontent.com');
  });

  it("answers Google's refusal with a plain sentence and Google's words as detail", async () => {
    mockRequestDeviceCode.mockRejectedValue(new Error('The OAuth client was not found.'));
    const res = await POST(new Request('http://localhost/api/auth/google/device', { method: 'POST' }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'Failed to start device flow',
      detail: 'The OAuth client was not found.',
      clientIdHint: '12345678…ps.googleusercontent.com',
    });
  });

  it('leaves the hint out when no client id is saved', async () => {
    mockGetSecret.mockResolvedValue(null);
    mockRequestDeviceCode.mockRejectedValue(new Error('nope'));
    const res = await POST(new Request('http://localhost/api/auth/google/device', { method: 'POST' }) as never);
    expect(await res.json()).toEqual({ error: 'Failed to start device flow', detail: 'nope' });
  });
});

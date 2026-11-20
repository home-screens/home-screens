import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestDeviceCodeGrant } from '@/lib/oauth-form-post';
import { parseDeviceCodeStart, shortSignInUrl } from '@/lib/oauth-device-flow';

afterEach(() => vi.unstubAllGlobals());

describe('parseDeviceCodeStart', () => {
  it('reads both spellings of the sign-in address', () => {
    const rfc = parseDeviceCodeStart(true, 200, { device_code: 'd', user_code: 'U', verification_uri: 'https://a.example/link' });
    const google = parseDeviceCodeStart(true, 200, { device_code: 'd', user_code: 'U', verification_url: 'https://b.example/device' });
    expect(rfc).toMatchObject({ ok: true, grant: { verificationUrl: 'https://a.example/link' } });
    expect(google).toMatchObject({ ok: true, grant: { verificationUrl: 'https://b.example/device' } });
  });

  it('leaves a missing lifetime and interval for the caller to default', () => {
    const start = parseDeviceCodeStart(true, 200, { device_code: 'd', user_code: 'U' });
    expect(start).toEqual({
      ok: true,
      grant: { deviceCode: 'd', userCode: 'U', verificationUrl: null, expiresIn: null, interval: null },
    });
  });

  it('is a failure when a 2xx carries no codes', () => {
    expect(parseDeviceCodeStart(true, 200, { user_code: 'U' })).toEqual({ ok: false, status: 200, detail: null });
  });

  it("carries the provider's own reason, description first", () => {
    expect(parseDeviceCodeStart(false, 400, { error: 'invalid_client', error_description: 'No such app.' }))
      .toEqual({ ok: false, status: 400, detail: 'No such app.' });
    expect(parseDeviceCodeStart(false, 401, { error: 'invalid_client' }))
      .toEqual({ ok: false, status: 401, detail: 'invalid_client' });
  });
});

describe('requestDeviceCodeGrant', () => {
  it('survives an error page that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })));
    const start = await requestDeviceCodeGrant('https://provider.example/device', { client_id: 'x' });
    expect(start.ok).toBe(false);
    expect(start).toMatchObject({ status: 400 });
  });

  it('sends a form and reads a JSON answer', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ device_code: 'd', user_code: 'U', verification_uri: 'https://p.example/link', expires_in: 900, interval: 5 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const start = await requestDeviceCodeGrant('https://provider.example/device', { client_id: 'x', scope: 'a b' });
    expect(start).toEqual({
      ok: true,
      grant: { deviceCode: 'd', userCode: 'U', verificationUrl: 'https://p.example/link', expiresIn: 900, interval: 5 },
    });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(String(init.body)).toBe('client_id=x&scope=a+b');
  });
});

describe('shortSignInUrl', () => {
  it('reads as people would type it', () => {
    expect(shortSignInUrl('https://www.google.com/device')).toBe('google.com/device');
    expect(shortSignInUrl('https://microsoft.com/devicelogin')).toBe('microsoft.com/devicelogin');
    expect(shortSignInUrl('https://example.com/activate/')).toBe('example.com/activate');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upstreamError, UpstreamError } from '../upstream-error';
import { SetupError } from '../api-utils';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('upstreamError', () => {
  it.each([401, 403])('sorts a %i as a rejected key the household can fix', async (status) => {
    const error = await upstreamError(new Response('nope', { status }), 'Immich');
    expect(error).toBeInstanceOf(SetupError);
    expect(error).toMatchObject({ needs: 'invalidKey', service: 'Immich', page: undefined });
  });

  it('carries the service\'s words as detail, outside the message, for the editor\'s key check', async () => {
    const error = await upstreamError(new Response('{"message":"API key is invalid."}', { status: 401 }), 'WeatherAPI.com');
    expect(error).toBeInstanceOf(SetupError);
    expect(error.message).toBe('WeatherAPI.com turned the key down (401)');
    expect((error as SetupError).detail).toContain('API key is invalid');
    const silent = await upstreamError(new Response('', { status: 401 }), 'WeatherAPI.com');
    expect((silent as SetupError).detail).toBeUndefined();
  });

  it('names the page that holds the key when told', async () => {
    const error = await upstreamError(new Response('', { status: 401 }), 'OpenWeatherMap', { page: 'weather' });
    expect(error).toMatchObject({ needs: 'invalidKey', page: 'weather' });
  });

  it('recognizes a key turned down in the body, as Google does with a 400', async () => {
    const res = new Response('{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 });
    const error = await upstreamError(res, 'Google Maps', { keyRejected: /API_KEY_INVALID/ });
    expect(error).toBeInstanceOf(SetupError);
  });

  it('hands any other refusal back with its status and body, never the key', async () => {
    const error = await upstreamError(new Response('busy', { status: 503 }), 'TomTom');
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ service: 'TomTom', status: 503, text: 'busy', message: 'TomTom answered 503' });
  });

  it('keeps the service\'s own words to the log, cut to a readable length', async () => {
    await upstreamError(new Response('<html>' + 'x'.repeat(2000), { status: 500 }), 'NASA');
    const logged = vi.mocked(console.warn).mock.calls[0].join(' ');
    expect(logged).toContain('NASA answered 500');
    expect(logged.length).toBeLessThan(400);
  });
});

import { describe, it, expect } from 'vitest';
import { readFetchError, sameFetchError, setupError, transientError } from '../fetch-error';

function res(status: number, body?: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  } as unknown as Response;
}

describe('readFetchError', () => {
  it('classifies a code:setup body as a setup error carrying its service', async () => {
    const err = await readFetchError(
      res(400, { error: 'No OpenWeatherMap API key configured.', code: 'setup', setup: { needs: 'key', service: 'OpenWeatherMap' } }),
      'API error 400',
    );
    expect(err).toEqual({
      kind: 'setup',
      message: 'No OpenWeatherMap API key configured.',
      setup: { needs: 'key', service: 'OpenWeatherMap' },
    });
  });

  it('treats an error body without a setup code as transient and keeps error + detail', async () => {
    const err = await readFetchError(res(500, { error: 'Failed', detail: 'upstream 502' }), 'API error 500');
    expect(err).toEqual({ kind: 'transient', message: 'Failed: upstream 502' });
  });

  it('falls back to the given message when the body is not JSON', async () => {
    expect(await readFetchError(res(502), 'API error 502')).toEqual(transientError('API error 502'));
  });

  it('ignores a malformed setup payload rather than trusting it', async () => {
    const err = await readFetchError(res(400, { error: 'x', code: 'setup', setup: { needs: 'key' } }), 'fallback');
    expect(err.kind).toBe('transient');
  });
});

describe('readFetchError page', () => {
  it('keeps a weather page hint and drops anything else', async () => {
    const weather = await readFetchError(res(400, { error: 'x', code: 'setup', setup: { needs: 'key', service: 'WeatherAPI', page: 'weather' } }), 'f');
    expect(weather.setup?.page).toBe('weather');
    const other = await readFetchError(res(400, { error: 'x', code: 'setup', setup: { needs: 'key', service: 'Todoist', page: 'bogus' } }), 'f');
    expect(other.setup?.page).toBeUndefined();
  });
});

describe('sameFetchError', () => {
  it('treats structurally equal errors as the same, so repeated polls keep their state object', () => {
    const a = setupError('key', 'Todoist', { message: 'm' });
    expect(sameFetchError(a, setupError('key', 'Todoist', { message: 'm' }))).toBe(true);
    expect(sameFetchError(a, setupError('invalidKey', 'Todoist', { message: 'm' }))).toBe(false);
    expect(sameFetchError(transientError('x'), transientError('x'))).toBe(true);
    expect(sameFetchError(transientError('x'), transientError('y'))).toBe(false);
    expect(sameFetchError(null, transientError('x'))).toBe(false);
    expect(sameFetchError(null, null)).toBe(true);
  });
});

describe('setupError', () => {
  it('builds a classified error with a default message', () => {
    expect(setupError('key', 'Pirate Weather')).toEqual({
      kind: 'setup',
      message: 'Pirate Weather needs setup',
      setup: { needs: 'key', service: 'Pirate Weather' },
    });
  });
});

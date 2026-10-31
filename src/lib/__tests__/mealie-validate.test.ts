import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Test button's check, which the Mealie card also runs when it opens:
 * every answer names the saved address, so the card can show it in its box.
 */

const secrets = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
vi.mock('../secrets', () => ({ getSecret: vi.fn(async (key: string) => secrets.values[key]) }));
vi.mock('../api-utils', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api-utils')>();
  return { ...real, fetchWithTimeout: vi.fn() };
});

import { validateMealieConnection } from '../mealie';
import { fetchWithTimeout } from '../api-utils';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.clearAllMocks();
  secrets.values = { mealie_url: 'http://localhost:9925/', mealie_api_key: 'abc' };
});

describe('validateMealieConnection', () => {
  it('names the household and the address the hub uses', async () => {
    vi.mocked(fetchWithTimeout).mockImplementation(async (url) => (String(url).endsWith('/api/app/about')
      ? json(200, { version: 'v3.29.0' })
      : json(200, { id: 'u', username: 'sam', fullName: 'Sam', group: 'Home', household: 'Family', groupSlug: 'home', householdSlug: 'family' })));
    expect(await validateMealieConnection()).toEqual({ ok: true, version: '3.29.0', household: 'Family', user: 'Sam', url: 'http://localhost:9925' });
  });

  it('names the address with a refused token', async () => {
    vi.mocked(fetchWithTimeout).mockImplementation(async (url) => (String(url).endsWith('/api/app/about') ? json(200, { version: '3.29.0' }) : json(401, {})));
    expect(await validateMealieConnection()).toEqual({ ok: false, failure: 'key-rejected', version: '3.29.0', url: 'http://localhost:9925' });
  });

  it('names the address when nothing answers there', async () => {
    vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await validateMealieConnection()).toEqual({ ok: false, failure: 'unreachable', url: 'http://localhost:9925' });
  });

  it('names a saved address with no token yet, and an address that is not one as typed', async () => {
    secrets.values = { mealie_url: '192.168.1.50:9925' };
    expect(await validateMealieConnection()).toEqual({ ok: false, failure: 'not-set-up', url: 'http://192.168.1.50:9925' });
    secrets.values = { mealie_url: 'ftp://pantry', mealie_api_key: 'abc' };
    expect(await validateMealieConnection()).toEqual({ ok: false, failure: 'bad-address', url: 'ftp://pantry' });
    secrets.values = {};
    expect(await validateMealieConnection()).toEqual({ ok: false, failure: 'not-set-up' });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });
});

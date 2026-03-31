import { describe, it, expect, vi, beforeEach } from 'vitest';
import { displayFetch, setDisplayToken } from '../display-fetch';

describe('displayFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setDisplayToken(null);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response('ok', { status: 200 })),
      ),
    );
  });

  it('calls fetch without Authorization header when no token is set', async () => {
    await displayFetch('http://localhost/api/config');

    expect(fetch).toHaveBeenCalledWith('http://localhost/api/config', undefined);
  });

  it('adds Authorization header when token is set', async () => {
    setDisplayToken('my-display-token');

    await displayFetch('http://localhost/api/config');

    const call = vi.mocked(fetch).mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer my-display-token');
  });

  it('does not overwrite existing Authorization header', async () => {
    setDisplayToken('my-display-token');

    await displayFetch('http://localhost/api/config', {
      headers: { Authorization: 'Bearer custom-token' },
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer custom-token');
  });

  it('passes through other init options when adding token', async () => {
    setDisplayToken('my-token');

    await displayFetch('http://localhost/api/config', {
      method: 'POST',
      body: '{}',
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
  });

  it('works with URL objects', async () => {
    const url = new URL('http://localhost/api/config');
    await displayFetch(url);

    expect(fetch).toHaveBeenCalledWith(url, undefined);
  });

  it('resumes unauthenticated fetch after clearing token', async () => {
    setDisplayToken('my-token');
    setDisplayToken(null);

    await displayFetch('http://localhost/api/config');

    expect(fetch).toHaveBeenCalledWith('http://localhost/api/config', undefined);
  });
});

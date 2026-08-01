import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';

/**
 * Tests for the editor-wide fetch wrapper that redirects to /login on 401.
 *
 * `editorFetch` is the single chokepoint used by every editor component in
 * place of raw `fetch`, so a regression here (missed redirect, swallowed
 * error) would quietly leave the editor showing a stale UI for a
 * logged-out user. We stub `window.location` + `window.location.search`
 * because the test environment is `node` and the real DOM is absent.
 */

const mockFetch = vi.fn();

let hrefAssignments: string[];
let originalWindow: unknown;

beforeEach(() => {
  mockFetch.mockReset();
  hrefAssignments = [];
  vi.stubGlobal('fetch', mockFetch);

  originalWindow = (globalThis as { window?: unknown }).window;
  // Property descriptor with a setter captures each href assignment so
  // tests can assert on where the redirect landed without needing jsdom.
  const fakeLocation = {
    pathname: '/editor/settings',
    search: '?section=defaults&page=screen',
    get href() { return 'http://localhost/editor/settings?section=defaults&page=screen'; },
    set href(v: string) { hrefAssignments.push(v); },
  };
  (globalThis as { window: unknown }).window = { location: fakeLocation };
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window: unknown }).window = originalWindow;
  }
});

describe('editorFetch', () => {
  it('passes through a successful response unchanged', async () => {
    const res = new Response('ok', { status: 200 });
    mockFetch.mockResolvedValue(res);

    const returned = await editorFetch('/api/config');
    expect(returned).toBe(res);
    expect(hrefAssignments).toEqual([]);
  });

  it('forwards the URL and options to the underlying fetch', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }));
    await editorFetch('/api/config', { method: 'PUT', body: '{}' });
    expect(mockFetch).toHaveBeenCalledWith('/api/config', { method: 'PUT', body: '{}' });
  });

  it('does not treat a 403 as a login-required redirect', async () => {
    // 403 is "you are logged in but not allowed" — bouncing to /login would
    // create an infinite loop for an already-authenticated user. Only 401
    // should trigger the redirect.
    mockFetch.mockResolvedValue(new Response('Forbidden', { status: 403 }));
    const returned = await editorFetch('/api/config');
    expect(returned.status).toBe(403);
    expect(hrefAssignments).toEqual([]);
  });

  it('redirects to /login and throws on 401', async () => {
    mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

    await expect(editorFetch('/api/config')).rejects.toThrow('Session expired');
    expect(hrefAssignments).toHaveLength(1);
    expect(hrefAssignments[0]).toMatch(/^\/login\?from=/);
  });

  it('URL-encodes the current location into the `from` query parameter', async () => {
    // Special chars in the path/search must survive round-trip through
    // /login → back here. Testing that the encoder is doing its job.
    const loc = (window as unknown as { location: { pathname: string; search: string } }).location;
    loc.pathname = '/editor/Main & Co';
    loc.search = '?x=1&y=2';
    mockFetch.mockResolvedValue(new Response('', { status: 401 }));

    await expect(editorFetch('/api/config')).rejects.toThrow('Session expired');

    const target = hrefAssignments[0];
    expect(target.startsWith('/login?from=')).toBe(true);
    const fromParam = decodeURIComponent(target.slice('/login?from='.length));
    expect(fromParam).toBe('/editor/Main & Co?x=1&y=2');
  });

  it('still throws even if somehow the href setter is a no-op', async () => {
    // Defensive: the caller always observes a rejected promise on 401,
    // so awaiting code never accidentally continues with a non-response.
    mockFetch.mockResolvedValue(new Response('', { status: 401 }));
    const promise = editorFetch('/api/config');
    await expect(promise).rejects.toBeInstanceOf(Error);
  });
});

describe('isSessionExpired', () => {
  // Round-trip: the throw site and the consumer must stay in sync. If this
  // test fails, both hooks.ts catch guards silently regress to flashing the
  // "disconnected"/"error" UI during the /login redirect window.
  it('returns true for the error editorFetch throws on 401', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 401 }));
    let caught: unknown;
    try { await editorFetch('/api/config'); } catch (e) { caught = e; }
    expect(isSessionExpired(caught)).toBe(true);
  });

  it('returns false for any other error', () => {
    expect(isSessionExpired(new Error('Network failure'))).toBe(false);
    expect(isSessionExpired(new TypeError('bad arg'))).toBe(false);
    expect(isSessionExpired('Session expired')).toBe(false);
    expect(isSessionExpired(null)).toBe(false);
    expect(isSessionExpired(undefined)).toBe(false);
  });
});

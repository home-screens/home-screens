import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { HUB_REQUEST_TIMEOUT_MS, HubUnreachableError, readJson } from '@/lib/hub-request';

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
  vi.useRealTimers();
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
    expect(mockFetch).toHaveBeenCalledWith('/api/config', expect.objectContaining({ method: 'PUT', body: '{}' }));
  });

  // A write that hung on a weak signal held every later write in its tab, with
  // the change looking saved, for as long as the phone kept the socket open.
  it('gives up on a request the hub never answers', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    }));
    const settled = expect(editorFetch('/api/notes')).rejects.toBeInstanceOf(HubUnreachableError);
    await vi.advanceTimersByTimeAsync(HUB_REQUEST_TIMEOUT_MS);
    await settled;
  });

  it('waits longer for a request that asks to, and not at all for one that must stay open', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    void editorFetch('/api/system/network/wifi/connect', { timeoutMs: 90_000 });
    await vi.advanceTimersByTimeAsync(HUB_REQUEST_TIMEOUT_MS);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(90_000 - HUB_REQUEST_TIMEOUT_MS);
    expect(signal?.aborted).toBe(true);

    void editorFetch('/api/plugins/install', { timeoutMs: null });
    expect(signal).toBeUndefined();
  });

  // The headers came, the body stalled: Chromium ends such a body with a plain
  // AbortError when the deadline fires, which readJson reads as the hub gone.
  it('cuts off an answer whose body stalls, and readJson says the hub is out of reach', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"notes":['));
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('The user aborted a request.', 'AbortError')));
        },
      });
      return new Response(body, { status: 200 });
    });
    const res = await editorFetch('/api/day-notes');
    const reading = expect(readJson(res)).rejects.toBeInstanceOf(HubUnreachableError);
    await vi.advanceTimersByTimeAsync(HUB_REQUEST_TIMEOUT_MS);
    await reading;
  });

  // The browser's own words ("Load failed", "Failed to fetch") reached families.
  it('says a dropped connection is the hub out of reach', async () => {
    mockFetch.mockRejectedValue(new TypeError('Load failed'));
    await expect(editorFetch('/api/todo/lists')).rejects.toBeInstanceOf(HubUnreachableError);
  });

  it("lets the caller's own cancel through as it is", async () => {
    const controller = new AbortController();
    const cancelled = new DOMException('Aborted', 'AbortError');
    mockFetch.mockImplementation(async () => {
      controller.abort(cancelled);
      throw cancelled;
    });
    await expect(editorFetch('/api/geocode?q=x', { signal: controller.signal })).rejects.toBe(cancelled);
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

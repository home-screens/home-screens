import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dispatchDisplayCommand, displayCommandRequest, withDisplayId, withDisplayTarget } from '@/lib/display-dispatch';

describe('dispatchDisplayCommand', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });

  it('dispatches next-screen with no target to the legacy queue', async () => {
    await dispatchDisplayCommand(undefined, 'next-screen');
    expect(fetch).toHaveBeenCalledWith('/api/display/next-screen', expect.objectContaining({ method: 'GET' }));
  });

  it('dispatches to all displays when target is "all"', async () => {
    await dispatchDisplayCommand('all', 'next-screen');
    expect(fetch).toHaveBeenCalledWith('/api/display/next-screen?display=all', expect.any(Object));
  });

  it('dispatches to a specific display id', async () => {
    await dispatchDisplayCommand('kitchen', 'sleep');
    expect(fetch).toHaveBeenCalledWith('/api/display/sleep?display=kitchen', expect.any(Object));
  });

  it('POSTs brightness with value and displayId in a JSON body', async () => {
    await dispatchDisplayCommand('kitchen', 'brightness', { value: 42 });
    expect(fetch).toHaveBeenCalledWith(
      '/api/display/brightness',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ value: 42, displayId: 'kitchen' }),
      }),
    );
  });

  it('POSTs brightness without displayId when target is undefined', async () => {
    await dispatchDisplayCommand(undefined, 'brightness', { value: 80 });
    expect(fetch).toHaveBeenCalledWith(
      '/api/display/brightness',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ value: 80 }),
      }),
    );
  });

  it('treats "self" as unresolved and omits the display param', async () => {
    await dispatchDisplayCommand('self', 'next-screen');
    expect(fetch).toHaveBeenCalledWith('/api/display/next-screen', expect.any(Object));
  });

  it('swallows fetch rejections without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(dispatchDisplayCommand('kitchen', 'sleep')).resolves.toBeUndefined();
  });

  it('skips dispatch when target is an empty string', async () => {
    await dispatchDisplayCommand('', 'next-screen');
    expect(fetch).toHaveBeenCalledWith('/api/display/next-screen', expect.any(Object));
  });
});

/**
 * `withDisplayTarget` is the helper every display command goes through to
 * append `?display=<id>` (or `&display=<id>`). Single-display installs
 * leave target undefined so the URL passes through untouched — regressing
 * this would either break legacy single-display /remote calls or send
 * broadcast requests to every display by mistake.
 *
 * The function is small but exercised by every command button, status
 * poll, and chore/meal mutation in RemoteClient, so the edge cases
 * (existing query string, encoding, special ids) matter in practice.
 */

describe('withDisplayTarget', () => {
  it('returns the URL unchanged when target is undefined (single-display mode)', () => {
    // This is the "legacy no-displays-registry" path — the single-display
    // install has a single implicit target so callers shouldn't decorate
    // their URLs at all.
    expect(withDisplayTarget('/api/display/status', undefined)).toBe('/api/display/status');
  });

  it('returns the URL unchanged when target is an empty string', () => {
    // The helper uses `!target` so an empty string is treated like
    // undefined. Callers that pass user input verbatim rely on this —
    // an empty string should never become `?display=`.
    expect(withDisplayTarget('/api/display/status', '')).toBe('/api/display/status');
  });

  it('appends `?display=<id>` when the URL has no existing query string', () => {
    expect(withDisplayTarget('/api/display/status', 'kitchen')).toBe(
      '/api/display/status?display=kitchen',
    );
  });

  it('appends `&display=<id>` when the URL already has a query string', () => {
    // A naive `?display=${id}` would produce `?a=1?display=kitchen` which
    // most routers treat as a single opaque value — this test pins the
    // separator logic.
    expect(withDisplayTarget('/api/display/commands?foo=bar', 'kitchen')).toBe(
      '/api/display/commands?foo=bar&display=kitchen',
    );
  });

  it('treats a URL ending in `?` as having an existing query string', () => {
    // `url.includes('?')` triggers the `&` branch; the resulting URL is
    // odd-looking (`?&display=x`) but still routes correctly. Locking
    // this in so a future "strip trailing ?" tweak doesn't silently
    // emit `??display=` by mistake.
    expect(withDisplayTarget('/api/x?', 'kitchen')).toBe('/api/x?&display=kitchen');
  });

  it('handles the broadcast keyword "all" as a normal id', () => {
    // The broadcast case is resolved on the server (`/api/display/commands`
    // treats `display=all` specially); the client helper just passes it
    // through as an encoded value.
    expect(withDisplayTarget('/api/display/commands', 'all')).toBe(
      '/api/display/commands?display=all',
    );
  });

  it('encodes special characters in the target id', () => {
    // validateDisplays rejects ids that need encoding, but we still
    // defend at the edge so a misconfigured id can never produce
    // malformed URLs. This test pins the encoder.
    expect(withDisplayTarget('/api/display/status', 'foo bar')).toBe(
      '/api/display/status?display=foo%20bar',
    );
  });

  it('preserves URL fragments (hash) when appending the query', () => {
    // Most /remote fetches don't include fragments, but the naive
    // `${url}?${q}` would break if a caller ever added one. The helper
    // uses `includes('?')` which evaluates before the fragment, so a
    // hash before `?` still gets the right separator.
    // A URL like `/api/x?a=1#frag` already has `?` → separator is `&`.
    expect(withDisplayTarget('/api/x?a=1#frag', 'kitchen')).toBe(
      '/api/x?a=1#frag&display=kitchen',
    );
  });

  it('handles URLs with multiple query params already present', () => {
    expect(withDisplayTarget('/api/x?a=1&b=2', 'kitchen')).toBe(
      '/api/x?a=1&b=2&display=kitchen',
    );
  });

  it('encodes percent signs in target ids (round-trip safety)', () => {
    // A literal `%` in the id must be re-encoded to `%25`, otherwise the
    // query string decodes to something different than what was typed.
    expect(withDisplayTarget('/api/x', 'a%b')).toBe('/api/x?display=a%25b');
  });
});

describe('withDisplayId', () => {
  it('adds the target after the body\'s own fields', () => {
    expect(JSON.stringify(withDisplayId({ value: 40 }, 'kitchen'))).toBe('{"value":40,"displayId":"kitchen"}');
    expect(withDisplayId({ value: 40 }, 'all')).toEqual({ value: 40, displayId: 'all' });
  });

  it('leaves the body alone with no target, an empty one, or "self"', () => {
    for (const target of [undefined, null, '', 'self']) {
      expect(withDisplayId({ value: 40 }, target)).toEqual({ value: 40 });
    }
  });
});

describe('displayCommandRequest', () => {
  it('is a GET with the target in the address for a command with nothing to carry', () => {
    expect(displayCommandRequest('sleep', 'kitchen')).toEqual({ url: '/api/display/sleep?display=kitchen', init: { method: 'GET' } });
    expect(displayCommandRequest('wake', undefined)).toEqual({ url: '/api/display/wake', init: { method: 'GET' } });
  });

  it('lets the phone and the editor POST the same command', () => {
    expect(displayCommandRequest('clear-alerts', 'all', undefined, 'POST')).toEqual({
      url: '/api/display/clear-alerts?display=all',
      init: { method: 'POST' },
    });
  });

  it('puts a payload and the target in a JSON body', () => {
    const { url, init } = displayCommandRequest('alert', 'kitchen', { type: 'info', title: undefined, message: 'Dinner', duration: 0 });
    expect(url).toBe('/api/display/alert');
    expect(init.method).toBe('POST');
    // An unset title is dropped; 0 (stay until dismissed) is kept as a number.
    expect(init.body).toBe('{"type":"info","message":"Dinner","duration":0,"displayId":"kitchen"}');
  });

  it('treats an empty payload as none', () => {
    expect(displayCommandRequest('reload', 'kitchen', {}).init.method).toBe('GET');
  });
});

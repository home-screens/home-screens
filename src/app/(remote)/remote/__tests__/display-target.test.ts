import { describe, it, expect } from 'vitest';
import { withDisplayTarget } from '../display-target';

/**
 * `withDisplayTarget` is the helper every /remote fetch goes through to
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

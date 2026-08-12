import { describe, it, expect } from 'vitest';
import { resolveRepoUrl } from '../PluginInstallPreview';

// This resolver is the only thing standing between third-party registry JSON and
// a rendered href, so the null cases matter more than the resolved ones.
describe('resolveRepoUrl', () => {
  const cases: Array<[string | undefined, string | null]> = [
    // Full URLs pass through unchanged.
    ['https://example.com/x', 'https://example.com/x'],
    ['http://example.com/x', 'http://example.com/x'],
    // Scheme matching is case-insensitive; a registry is free to shout.
    ['HTTPS://EXAMPLE.COM', 'HTTPS://EXAMPLE.COM'],
    ['Http://Example.com/x', 'Http://Example.com/x'],
    // GitHub owner/name shorthand is what the production registry publishes.
    ['home-screens/home-screens-plugin-strava', 'https://github.com/home-screens/home-screens-plugin-strava'],
    ['owner/repo.name-x', 'https://github.com/owner/repo.name-x'],
    ['javascript:alert(1)', null],
    ['data:text/html,x', null],
    // Protocol-relative: resolves against the page origin, so it is not a
    // web URL we can vouch for.
    ['//evil.com', null],
    // Anchored at the start, so leading whitespace is not tolerated.
    [' https://x', null],
    ['ftp://example.com/x', null],
    ['https:/example.com', null],
    ['example.com', null],
    // Shorthand is exactly one slash between two non-empty segments.
    ['a/b/c', null],
    ['/leading', null],
    ['trailing/', null],
    ['no-slash', null],
    ['', null],
    [undefined, null],
  ];

  it.each(cases)('%o -> %s', (repo, expected) => {
    expect(resolveRepoUrl(repo)).toBe(expected);
  });
});

import { describe, it, expect } from 'vitest';
import { confirmHubAddress, type HubRequestHost } from '../google-web-sign-in';

const direct = (host: string | null, forwardedHost: string | null = null): HubRequestHost => ({
  host,
  forwardedHost,
  viaTrustedProxy: false,
});
const viaProxy = (host: string | null, forwardedHost: string | null): HubRequestHost => ({
  host,
  forwardedHost,
  viaTrustedProxy: true,
});

describe('confirmHubAddress', () => {
  it.each([
    ['an IP and port', 'http://192.168.1.50:3000', direct('192.168.1.50:3000'), 'http://192.168.1.50:3000'],
    ['a .local name', 'http://homescreens.local:3000', direct('homescreens.local:3000'), 'http://homescreens.local:3000'],
    ['the default port', 'http://hub.local', direct('hub.local'), 'http://hub.local'],
    ['a default port written out in the header', 'http://hub.local', direct('hub.local:80'), 'http://hub.local'],
    ['https', 'https://hub.home.arpa', direct('hub.home.arpa'), 'https://hub.home.arpa'],
    ['upper case', 'http://HUB.LOCAL:3000', direct('hub.local:3000'), 'http://hub.local:3000'],
    ['IPv6', 'http://[fe80::1]:3000', direct('[fe80::1]:3000'), 'http://[fe80::1]:3000'],
  ])('accepts %s when it names the host the request reached', (_label, origin, request, expected) => {
    expect(confirmHubAddress(origin, request)).toBe(expected);
  });

  it.each([
    ['nothing', null, direct('192.168.1.50:3000')],
    ['another host', 'http://192.168.1.99:3000', direct('192.168.1.50:3000')],
    ['another port', 'http://192.168.1.50:8080', direct('192.168.1.50:3000')],
    ['no Host header', 'http://192.168.1.50:3000', direct(null)],
    ['a path', 'http://192.168.1.50:3000/editor', direct('192.168.1.50:3000')],
    ['a user name', 'http://me@192.168.1.50:3000', direct('192.168.1.50:3000')],
    ['a query', 'http://192.168.1.50:3000?x=1', direct('192.168.1.50:3000')],
    ['another scheme', 'javascript:alert(1)', direct('192.168.1.50:3000')],
    ['not a URL', '192.168.1.50:3000', direct('192.168.1.50:3000')],
    ['a forwarded host from a peer that is not a trusted proxy', 'https://photos.example.com', direct('127.0.0.1:3000', 'photos.example.com')],
  ])('refuses %s', (_label, origin, request) => {
    expect(confirmHubAddress(origin, request)).toBeNull();
  });

  it("believes a trusted proxy's forwarded host", () => {
    expect(confirmHubAddress('https://hub.lan', viaProxy('127.0.0.1:3000', 'hub.lan'))).toBe('https://hub.lan');
    expect(confirmHubAddress('https://hub.lan', viaProxy('127.0.0.1:3000', 'hub.lan, 127.0.0.1:3000'))).toBe('https://hub.lan');
    expect(confirmHubAddress('https://other.lan', viaProxy('127.0.0.1:3000', 'hub.lan'))).toBeNull();
  });
});

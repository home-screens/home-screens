import { describe, it, expect, afterEach, vi } from 'vitest';
import { isHubOwnScreen, isWallPageRequest } from '../wall-request';

function request(headers: Record<string, string>): Request {
  return new Request('http://0.0.0.0:3000/api/display/commands', { headers });
}

describe('isWallPageRequest', () => {
  it('is true for a fetch from a wall page on the hub', () => {
    expect(isWallPageRequest(request({ host: '192.168.1.10:3000', referer: 'http://192.168.1.10:3000/display/kitchen' }))).toBe(true);
    expect(isWallPageRequest(request({ host: 'hub.local:3000', referer: 'http://hub.local:3000/display' }))).toBe(true);
  });

  it('is false for curl or Home Assistant polling with the key: no referer', () => {
    expect(isWallPageRequest(request({ host: '192.168.1.10:3000', authorization: 'Bearer key' }))).toBe(false);
  });

  it('is false for a page that is not a wall', () => {
    expect(isWallPageRequest(request({ host: 'hub.local:3000', referer: 'http://hub.local:3000/remote' }))).toBe(false);
    expect(isWallPageRequest(request({ host: 'hub.local:3000', referer: 'http://hub.local:3000/displays' }))).toBe(false);
  });

  it('is false for a wall-shaped page on some other host', () => {
    expect(isWallPageRequest(request({ host: 'hub.local:3000', referer: 'http://elsewhere.example/display' }))).toBe(false);
  });

  it('accepts the forwarded host a proxy that rewrites Host sends', () => {
    expect(
      isWallPageRequest(request({ host: '127.0.0.1:3000', 'x-forwarded-host': 'wall.example', referer: 'https://wall.example/display/kitchen' })),
    ).toBe(true);
  });

  it('accepts the page\'s own header in place of a referer', () => {
    expect(isWallPageRequest(request({ host: '127.0.0.1:3000', 'x-hs-wall': '1' }))).toBe(true);
  });

  it('is false for a referer that is not an address', () => {
    expect(isWallPageRequest(request({ host: 'hub.local:3000', referer: 'not a url' }))).toBe(false);
  });
});

describe('isHubOwnScreen', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is true for a request from the hub itself with no forwarding header', () => {
    expect(isHubOwnScreen(request({ 'x-hs-client-ip': '127.0.0.1', 'x-hs-forwarded': '0', 'x-hs-via-trusted-proxy': '0' }))).toBe(true);
    expect(isHubOwnScreen(request({ 'x-hs-client-ip': '::1', 'x-hs-forwarded': '0', 'x-hs-via-trusted-proxy': '0' }))).toBe(true);
  });

  it('is false for a device on the network', () => {
    expect(isHubOwnScreen(request({ 'x-hs-client-ip': '192.168.1.50', 'x-hs-forwarded': '0', 'x-hs-via-trusted-proxy': '0' }))).toBe(false);
  });

  it('is false when the request came through something on the hub that forwards', () => {
    // A reverse proxy on the same Pi makes every visitor look local; the
    // forwarding header it adds is what gives it away.
    expect(isHubOwnScreen(request({ 'x-hs-client-ip': '127.0.0.1', 'x-hs-forwarded': '1', 'x-hs-via-trusted-proxy': '0' }))).toBe(false);
  });

  it('is false without the server\'s stamp', () => {
    expect(isHubOwnScreen(request({ 'x-hs-client-ip': '127.0.0.1' }))).toBe(false);
    expect(isHubOwnScreen(request({}))).toBe(false);
  });

  it('is still true on a hub that lists its own address as a trusted proxy, as the documented nginx setup does', () => {
    // The proxy's visitors carry X-Forwarded-For and are not the hub's own
    // screen; the kiosk loading localhost carries none and is.
    expect(isHubOwnScreen(request({ 'x-hs-client-ip': '127.0.0.1', 'x-hs-forwarded': '0', 'x-hs-via-trusted-proxy': '1' }))).toBe(true);
    expect(isHubOwnScreen(request({ 'x-hs-client-ip': '203.0.113.9', 'x-hs-forwarded': '1', 'x-hs-via-trusted-proxy': '1' }))).toBe(false);
  });

  it('is never true in the Docker image, which has no screen of its own', () => {
    vi.stubEnv('HS_NO_HUB_SCREEN', '1');
    expect(isHubOwnScreen(request({ 'x-hs-client-ip': '127.0.0.1', 'x-hs-forwarded': '0', 'x-hs-via-trusted-proxy': '0' }))).toBe(false);
  });

  // Known and accepted: a proxy on the hub that adds no forwarding header
  // (nginx's bare proxy_pass, an ssh tunnel) is indistinguishable from the
  // hub's own screen. The networking docs say to make it send
  // X-Forwarded-For.
  it('cannot tell a header-less proxy on the hub from the hub\'s own screen', () => {
    expect(isHubOwnScreen(request({ 'x-hs-client-ip': '127.0.0.1', 'x-hs-forwarded': '0', 'x-hs-via-trusted-proxy': '0' }))).toBe(true);
  });
});

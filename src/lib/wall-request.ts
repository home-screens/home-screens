/**
 * Two facts about a request that decide whether it may be given a wall
 * cookie (`display-admission.ts`): whether it came from a wall page, and
 * whether it came from the screen plugged into the hub itself.
 */
import { CLIENT_IP_HEADER, FORWARDED_HEADER } from './client-ip';
import { isOwnHost, parseAllowedOrigins } from './same-origin';
import { WALL_PAGE_HEADER } from './wall-request-header';


const allowedOrigins = parseAllowedOrigins(process.env.HS_ALLOWED_ORIGINS);

/**
 * Whether a request was made by a wall page, as opposed to curl, Home
 * Assistant or a bookmark holding the display key. Those must never be
 * turned into walls just because they poll with the key.
 *
 * A page's own fetch carries a `Referer` naming the page; an automation
 * sends none. The path must start with `/display` and the host must be one
 * the hub answers to. New page code also sends `x-hs-wall`, which stands in
 * for a `Referer` a proxy or a privacy setting stripped.
 *
 * This keeps accidents out. It is not a lock: anyone can write either
 * header by hand, so nothing is let in on the strength of this alone.
 *
 * Not `Sec-Fetch-Site`: browsers send it only to https and to localhost,
 * never to a hub on plain http, which is how every display-only Pi reaches
 * one.
 */
export function isWallPageRequest(request: Request): boolean {
  if (request.headers.get(WALL_PAGE_HEADER) === '1') return true;
  const referer = request.headers.get('referer');
  if (!referer) return false;
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return false;
  }
  if (url.pathname !== '/display' && !url.pathname.startsWith('/display/')) return false;
  return isOwnHost(url.host, {
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    allowedOrigins,
  });
}

const LOOPBACK = new Set(['127.0.0.1', '::1']);

/**
 * Whether a request came from the screen plugged into the hub: from the
 * hub's own address, with no forwarding header.
 *
 * The second half matters. A reverse proxy on the same Pi makes every
 * visitor look like the hub itself, and the forwarding header it adds is
 * what gives it away, whether or not the proxy is listed as trusted.
 *
 * Known limit: a proxy on the hub that adds no forwarding header at all
 * (nginx's bare `proxy_pass`, an `ssh -L` tunnel) cannot be told from the
 * hub's own screen, so the networking docs say such a proxy must be set to
 * send `X-Forwarded-For`. Refusing every request from a trusted proxy's
 * address would close that, but the documented setup lists `127.0.0.1` as
 * trusted on the very hub whose own screen loads `localhost`, and that
 * screen would then be left waiting to be let in.
 *
 * Never true where the hub has no screen of its own: the Docker image sets
 * `HS_NO_HUB_SCREEN=1`, since its port forwarding can present outside
 * callers as local. A missing stamp (tests, a runtime without the
 * instrumentation hook) answers false.
 */
export function isHubOwnScreen(request: Request): boolean {
  if (process.env.HS_NO_HUB_SCREEN === '1') return false;
  if (request.headers.get(FORWARDED_HEADER) !== '0') return false;
  return LOOPBACK.has(request.headers.get(CLIENT_IP_HEADER) ?? '');
}

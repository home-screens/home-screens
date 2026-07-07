/**
 * Stamps the real TCP peer address onto every incoming HTTP request as
 * `x-hs-client-ip`, before Next.js (proxy or route handlers) sees it.
 *
 * Why a prototype patch: App Router route handlers receive a web-standard
 * Request with no socket access, and the bundled Next server only fills
 * `x-forwarded-for` from the socket when the header is ABSENT
 * (`req.headers['x-forwarded-for'] ??= socket.remoteAddress`), so a
 * client-supplied value passes through untouched. Hooking
 * `Server.prototype.emit('request', …)` is the one place the socket and the
 * headers coexist for every request, regardless of whether the server was
 * created before or after this module loads.
 *
 * Installed once at boot by `src/instrumentation.ts` (nodejs runtime only).
 */
import http from 'node:http';
import https from 'node:https';
import { CLIENT_IP_HEADER, parseTrustedProxies, resolveClientIp } from './client-ip';

const INSTALLED_FLAG = Symbol.for('home-screens.clientIpPatchInstalled');

type EmitFn = (event: string | symbol, ...args: unknown[]) => boolean;

function stampClientIp(req: http.IncomingMessage, trustedProxies: string[]): void {
  const xff = req.headers['x-forwarded-for'];
  req.headers[CLIENT_IP_HEADER] = resolveClientIp(
    req.socket?.remoteAddress,
    Array.isArray(xff) ? xff.join(',') : xff,
    trustedProxies,
  );
}

function wrapEmit(proto: { emit: EmitFn }, trustedProxies: string[]): void {
  const originalEmit = proto.emit;
  proto.emit = function (event: string | symbol, ...args: unknown[]): boolean {
    if (event === 'request' && args[0]) {
      stampClientIp(args[0] as http.IncomingMessage, trustedProxies);
    }
    return originalEmit.call(this, event, ...args);
  };
}

/** Idempotent — the flag lives on globalThis so dev-mode module reloads don't double-wrap. */
export function installClientIpStamping(): void {
  const g = globalThis as { [INSTALLED_FLAG]?: boolean };
  if (g[INSTALLED_FLAG]) return;
  g[INSTALLED_FLAG] = true;

  const trustedProxies = parseTrustedProxies(process.env.HS_TRUSTED_PROXIES);
  wrapEmit(http.Server.prototype as unknown as { emit: EmitFn }, trustedProxies);
  // https.Server extends tls.Server, not http.Server — patch it separately.
  wrapEmit(https.Server.prototype as unknown as { emit: EmitFn }, trustedProxies);
}

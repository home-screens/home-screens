/**
 * Cross-origin write protection for `/api/*`.
 *
 * Threat model: everything else in this app assumes that if you are on the
 * LAN you are trusted, which is a deliberate trade-off for a password-less
 * install. This gate covers the case that assumption does NOT cover — an
 * attacker who is not on the network at all.
 *
 * A page on any origin can make a browser inside the house issue a request to
 * the hub. `POST` with `Content-Type: text/plain` is a CORS-*simple* request:
 * no preflight, so nothing stops it leaving the browser, and Next parses the
 * body as JSON regardless of the declared type. The attacker cannot read the
 * response — same-origin policy still applies — but they do not need to. The
 * write lands. Demonstrated against `POST /api/backup`, which took over
 * `data/auth.json` with an attacker-chosen password hash.
 *
 * The defence is the `Origin` header, which browsers set on every
 * cross-origin request and which page JavaScript cannot forge. Absence means
 * "not a browser" — curl, `scripts/reporter.sh`, server-to-server — and is
 * allowed, because a browser attack cannot produce an origin-less request.
 *
 * Deliberately NOT applied to GET/HEAD: same-origin policy already prevents
 * reading those responses cross-origin, so blocking them would add no
 * protection while risking legitimate embedding.
 */

/** Methods that can change state. HEAD/GET/OPTIONS are excluded on purpose. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Extra origins to accept, comma-separated, from `HS_ALLOWED_ORIGINS`.
 * For deployments fronted by a reverse proxy that rewrites `Host` and does
 * not forward `X-Forwarded-Host`. Mirrors the `HS_TRUSTED_PROXIES` escape
 * hatch in `client-ip.ts`. Default: empty.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => {
      // Accept either a full origin or a bare host; compare on host.
      try {
        return new URL(s.includes('://') ? s : `http://${s}`).host;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

export interface OriginCheckInput {
  method: string;
  /** The `Origin` request header, or null when absent. */
  origin: string | null;
  /** The `Host` request header. */
  host: string | null;
  /**
   * `X-Forwarded-Host`, honored when present.
   *
   * Safe to trust for THIS decision specifically: the attack depends on the
   * request being CORS-simple, and a simple request cannot carry a custom
   * header. Setting `X-Forwarded-Host` from page JavaScript forces a
   * preflight, which has no CORS response to satisfy it and never sends the
   * real request. So an attacker cannot use this field to talk their way past
   * the check — only a real proxy can populate it.
   */
  forwardedHost: string | null;
  /** Extra allowed hosts from `parseAllowedOrigins`. */
  allowedOrigins: string[];
}

/**
 * True when this is a state-changing request from a browser on a different
 * origin, i.e. one that should be refused.
 */
export function isDisallowedCrossOriginWrite(input: OriginCheckInput): boolean {
  if (!MUTATING_METHODS.has(input.method.toUpperCase())) return false;

  // No Origin → not a browser-initiated cross-origin request.
  if (!input.origin) return false;

  let originHost: string;
  try {
    originHost = new URL(input.origin).host.toLowerCase();
  } catch {
    // Includes the literal `null` origin browsers send from sandboxed
    // iframes and some redirect chains. Unprovable, so refuse.
    return true;
  }
  if (!originHost) return true;

  const candidates = [input.host, input.forwardedHost]
    .filter((h): h is string => typeof h === 'string' && h.length > 0)
    .map((h) => h.toLowerCase());

  if (candidates.includes(originHost)) return false;
  if (input.allowedOrigins.includes(originHost)) return false;
  return true;
}

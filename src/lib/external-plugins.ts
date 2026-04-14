/**
 * Helpers for installing plugins from user-provided tarball URLs
 * (outside the marketplace registry).
 */

/**
 * Substitute `{version}` placeholders in a URL template.
 * - Literal URLs (no `{version}`) pass through unchanged.
 * - Templated URLs require a non-empty `version` argument.
 */
export function resolveTarballUrl(template: string, version: string | undefined): string {
  const hasPlaceholder = template.includes('{version}');
  if (!hasPlaceholder) return template;
  if (!version) {
    throw new Error('URL contains {version} placeholder but no version was provided');
  }
  return template.replaceAll('{version}', version);
}

/**
 * Validate that a URL is safe to download from.
 * Accepts https:// everywhere, and http:// only for localhost / 127.0.0.1
 * (mirrors the dev-server loader's localhost convention).
 *
 * Uses string-prefix checks rather than `new URL()` so that templated URLs
 * like `https://x.io/v{version}/p.tar.gz` pass validation before the
 * `{version}` placeholder is substituted. The anchored regex prevents
 * subdomain attacks like `http://localhost.evil.com/...`.
 */
export function validateExternalUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL');
  }
  if (url.startsWith('https://')) return;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) return;
  throw new Error('URLs must use HTTPS. http://localhost is allowed for local testing.');
}

/**
 * Strip query string from a URL for audit logging, so tokens embedded in
 * query parameters (e.g. GitHub release download tokens) don't end up in logs.
 */
export function urlForAudit(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

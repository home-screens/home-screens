/**
 * Iframe sandbox and URL validation utilities.
 *
 * Used by both the editor (user feedback) and the module (runtime guard)
 * to prevent dangerous iframe configurations.
 */

/* ─── Sandbox token validation ─────────────── */

/**
 * Allowlist of valid iframe sandbox tokens.
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox
 */
const VALID_SANDBOX_TOKENS = new Set([
  'allow-downloads',
  'allow-forms',
  'allow-modals',
  'allow-orientation-lock',
  'allow-pointer-lock',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-presentation',
  'allow-same-origin',
  'allow-scripts',
  'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
  'allow-top-navigation-to-custom-protocols',
]);

export interface SandboxValidationResult {
  valid: boolean;
  /** Cleaned, deduplicated token string (only valid tokens). */
  sanitized: string;
  /** Tokens that were not recognized. */
  unknownTokens: string[];
  /** True if allow-same-origin + allow-scripts are both present. */
  dangerousCombination: boolean;
}

/**
 * Validates and sanitizes a sandbox attribute string.
 */
export function validateSandbox(sandbox: string): SandboxValidationResult {
  const raw = sandbox.trim().split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const unknownTokens: string[] = [];
  const validTokens: string[] = [];

  for (const token of raw) {
    const lower = token.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (VALID_SANDBOX_TOKENS.has(lower)) {
      validTokens.push(lower);
    } else {
      unknownTokens.push(token);
    }
  }

  const dangerousCombination =
    validTokens.includes('allow-same-origin') && validTokens.includes('allow-scripts');

  return {
    valid: unknownTokens.length === 0 && !dangerousCombination,
    sanitized: validTokens.join(' '),
    unknownTokens,
    dangerousCombination,
  };
}

/* ─── URL protocol validation ──────────────── */

const BLOCKED_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:', 'blob:']);

/**
 * Returns null if the URL is safe to embed, or an error message if it's blocked.
 */
export function validateIframeUrl(url: string): string | null {
  if (!url) return null; // empty URL is handled elsewhere (shows placeholder)
  try {
    const parsed = new URL(url);
    if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
      return `Protocol "${parsed.protocol}" is not allowed in iframes`;
    }
  } catch {
    // Relative URLs or malformed — let the browser handle it.
    // But still check for protocol-like prefixes that URL() might not parse.
    const lower = url.trimStart().toLowerCase();
    for (const proto of BLOCKED_PROTOCOLS) {
      if (lower.startsWith(proto)) {
        return `Protocol "${proto}" is not allowed in iframes`;
      }
    }
  }
  return null;
}

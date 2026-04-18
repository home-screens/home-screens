/**
 * Redacts secret-bearing fields from a ScreenConfiguration. Returns a deep
 * clone — never mutates the input. The output is safe to include in a
 * diagnostics bundle; the original is left untouched for hot-path reads.
 *
 * Redaction philosophy (whitelist by default):
 *   - The shape of a module's config is rarely documented exhaustively, so
 *     we assume any unknown string field whose key matches /url|token|key|
 *     secret|password/i is sensitive until proven otherwise.
 *   - Explicitly safe field names (list below) flow through unchanged.
 *   - Any string value that equals a known-secret value (resolved plugin
 *     secrets, passed in via options) is also replaced.
 */

import type { ScreenConfiguration } from '@/types/config';

export const REDACTED = '[redacted]';

export interface RedactOptions {
  /**
   * Strings that literally equal any entry here are always redacted. Use
   * this to scrub resolved plugin secrets whose reference key ("secrets.X")
   * has already been expanded inline into a module's config.
   */
  knownSecretValues?: string[];
}

/** Field names that are always redacted when they appear anywhere in the config. */
const ALWAYS_REDACT_KEYS = new Set<string>([
  'icalUrl',
  'url',                // iframe module URL, plugin tarball URLs, etc.
  'customDomain',
  'oauthClientId',
  'oauthClientSecret',
  'password',
  'passwordHash',
  'apiKey',
  'token',
  'accessToken',
  'refreshToken',
]);

/** Regex-based heuristic for opaque keys — catches "authToken", "widgetUrl", "apiKey2", etc. */
const SUSPICIOUS_KEY_RE = /(url|token|key|secret|password)$/i;

/** Keys that are known safe — never redacted even if they match the regex. */
const ALWAYS_ALLOW_KEYS = new Set<string>([
  'backgroundImage',       // local filename, not a URL with creds
  'id',
  'secretRef',             // reference to a secret key IS the signal
  'apiKeyRef',             // same
  'provider',              // "openweathermap" / "weatherapi" — provider enum
  'version',
]);

function shouldRedactKey(key: string): boolean {
  if (ALWAYS_REDACT_KEYS.has(key)) return true;
  if (ALWAYS_ALLOW_KEYS.has(key)) return false;
  return SUSPICIOUS_KEY_RE.test(key);
}

function redactValue(value: unknown, key: string, knownSecretValues: Set<string>): unknown {
  if (typeof value === 'string') {
    if (knownSecretValues.has(value)) return REDACTED;
    if (shouldRedactKey(key)) return REDACTED;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, key, knownSecretValues));
  }
  if (value && typeof value === 'object') {
    return walk(value as Record<string, unknown>, key, knownSecretValues);
  }
  return value;
}

function walk(
  node: unknown,
  parentKey: string,
  knownSecretValues: Set<string>,
): unknown {
  if (node === null || node === undefined) return node;
  if (Array.isArray(node)) {
    return node.map((v) => walk(v, parentKey, knownSecretValues));
  }
  if (typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = redactValue(value, key, knownSecretValues);
  }
  return out;
}

export function redactConfig(
  config: ScreenConfiguration,
  options: RedactOptions = {},
): ScreenConfiguration {
  const knownSecretValues = new Set(
    (options.knownSecretValues ?? []).filter((v): v is string => typeof v === 'string' && v.length > 0),
  );
  // Deep-clone via structuredClone, then walk the clone. We could walk the
  // input directly and build a copy, but structuredClone catches Date/Map/
  // Buffer values we'd otherwise strip silently.
  const cloned = structuredClone(config) as ScreenConfiguration;
  return walk(cloned, 'root', knownSecretValues) as ScreenConfiguration;
}

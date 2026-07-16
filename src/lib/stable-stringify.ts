/**
 * Key-order-independent stringify: two semantically equal objects authored
 * in different key orders produce the same string. Plain-object keys are
 * sorted recursively; arrays keep their order (order is meaningful there).
 * Used wherever a JSON value becomes an identity/dedupe key — module-config
 * dedupe in BackgroundProviderLayer, the plugin-settings fingerprint in
 * useLiveConfig. Isomorphic: no server-only imports.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

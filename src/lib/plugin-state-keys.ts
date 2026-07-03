/**
 * Canonical `plugin:<id>:` namespacing for plugin-published shared-state keys.
 *
 * Plugin IDs are case-insensitive on disk (PLUGIN_ID_PATTERN allows uppercase)
 * but shared-state keys are lowercase-only, so the namespace portion is always
 * lowercased here. The key *rest* is deliberately NOT case-normalized — the
 * store's rejection warning stays the single charset enforcement point, so a
 * plugin publishing `Door` gets a visible warning instead of silent mangling.
 *
 * This module is the single source of truth for the prefix: the SDK
 * (`publishState` / `clearState`), module registration (`registerPluginModule`),
 * manifest validation, and plugin unregister cleanup must all derive keys
 * through it so editor picker keys always match runtime keys.
 */

/** Canonical state namespace for a plugin id. */
export function pluginStatePrefix(pluginId: string): string {
  return `plugin:${pluginId.toLowerCase()}:`;
}

/**
 * Force-namespace a plugin-supplied key: strips an already-present own prefix
 * (matched case-insensitively) then prepends the canonical lowercase one.
 * A key targeting another plugin's namespace is NOT stripped — it gets
 * double-prefixed, which keeps producers inside their own namespace.
 */
export function pluginStateKey(pluginId: string, key: string): string {
  const prefix = pluginStatePrefix(pluginId);
  const rest = key.toLowerCase().startsWith(prefix) ? key.slice(prefix.length) : key;
  return prefix + rest;
}

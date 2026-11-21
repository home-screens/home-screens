/**
 * The characters a plugin id may hold: letters, digits, `_` and `-`.
 *
 * No imports, so the wall's stores can check an id without pulling in the
 * `fs` and `path` that `plugin-utils.ts` needs for the plugin folder.
 */
export const PLUGIN_ID_PATTERN = /^[a-z0-9_-]+$/i;

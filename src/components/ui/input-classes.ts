/**
 * Shared input class constants — single source of truth for editor form styling.
 *
 * Two size tiers:
 *   - sm (INPUT_CLASS / NESTED_INPUT_CLASS) — compact property-panel inputs
 *   - md (MODAL_INPUT_CLASS) — roomier modal/dialog inputs with focus states
 *
 * Exposed to plugins via window.__HS_SDK__ in PluginGlobals.tsx.
 */

/** Compact input for property panels (text-xs). */
export const INPUT_CLASS =
  'w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-200';

/** Even more compact input for nested/indented fields (lighter bg to show hierarchy). */
export const NESTED_INPUT_CLASS =
  'w-full px-2 py-0.5 text-xs bg-neutral-700 border border-neutral-600 rounded text-neutral-200';

/** Larger input for CRUD modals (text-sm) with focus ring and transitions. */
export const MODAL_INPUT_CLASS =
  'w-full px-2.5 py-1.5 text-sm bg-neutral-800 border border-neutral-600 rounded-md text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400 transition-colors';

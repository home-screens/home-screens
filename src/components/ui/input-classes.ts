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
  'w-full px-2 py-1 text-xs bg-hs-input border border-hs-border-strong rounded text-hs-text-body';

/** Even more compact input for nested/indented fields (lighter bg to show hierarchy). */
export const NESTED_INPUT_CLASS =
  'w-full px-2 py-0.5 text-xs bg-hs-input-hover border border-hs-border-strong rounded text-hs-text-body';

/** Larger input for CRUD modals (text-sm) with focus ring and transitions. */
export const MODAL_INPUT_CLASS =
  'w-full px-2.5 py-1.5 text-sm bg-hs-input border border-hs-border-strong rounded-md text-hs-text-body placeholder:text-hs-text-faint focus:outline-none focus:border-hs-text-muted transition-colors';

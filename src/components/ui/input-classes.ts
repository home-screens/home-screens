/**
 * Shared input class constants: the single source of truth for editor form styling.
 *
 * Tiers, smallest first:
 *   - INPUT_CLASS / NESTED_INPUT_CLASS: compact property-panel inputs (text-xs)
 *   - SETTINGS_INPUT_SM_CLASS: a Settings control inside a row, beside its label
 *   - SETTINGS_INPUT_CLASS: a Settings field on its own line
 *   - MODAL_INPUT_CLASS: a field inside a window
 *
 * Every tier shows focus the same way: the border turns the accent colour.
 * Buttons, switches and checkboxes, which have no border of their own to
 * colour, take `FOCUS_RING_CLASS`, the same accent drawn as an outline. A
 * field the caller marks `aria-invalid` gets a danger border in every tier.
 *
 * Exposed to plugins via window.__HS_SDK__ in PluginGlobals.tsx.
 */

/** How a text box, select or text area shows focus, and a value it cannot take. */
const FIELD_FOCUS = 'focus:outline-none focus:border-hs-accent aria-invalid:border-hs-danger';

/** Keyboard focus for a button, switch or checkbox: an accent outline just outside it. */
export const FOCUS_RING_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hs-accent';

/** Compact input for property panels (text-xs). */
export const INPUT_CLASS =
  `w-full px-2 py-1 text-xs bg-hs-input border border-hs-border-strong rounded text-hs-text-body placeholder:text-hs-text-faint ${FIELD_FOCUS}`;

/** Even more compact input for nested/indented fields (lighter bg to show hierarchy). */
export const NESTED_INPUT_CLASS =
  `w-full px-2 py-0.5 text-xs bg-hs-input-hover border border-hs-border-strong rounded text-hs-text-body placeholder:text-hs-text-faint ${FIELD_FOCUS}`;

/** Larger input for windows (text-sm). */
export const MODAL_INPUT_CLASS =
  `w-full px-2.5 py-1.5 text-sm bg-hs-input border border-hs-border-strong rounded-md text-hs-text-body placeholder:text-hs-text-faint transition-colors ${FIELD_FOCUS}`;

/**
 * Text box on a Settings page (text-sm, roomier than the property panel's).
 * Carries no width, so each field adds its own (`w-full`, `flex-1`, `w-24`).
 */
export const SETTINGS_INPUT_CLASS =
  `rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 placeholder:text-hs-text-faint ${FIELD_FOCUS}`;

/**
 * The smaller Settings box, for a select or time sitting in a row beside its
 * label, or a short add form inside a card. Carries no width either.
 */
export const SETTINGS_INPUT_SM_CLASS =
  `rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-2.5 py-1.5 placeholder:text-hs-text-faint ${FIELD_FOCUS}`;

/** A native checkbox or radio button: the theme's accent when ticked, one size everywhere. */
export const CHECKBOX_CLASS =
  `size-3.5 shrink-0 cursor-pointer accent-hs-accent disabled:cursor-not-allowed ${FOCUS_RING_CLASS}`;

import type React from 'react';
import { withAlpha } from '@/lib/hex-color';
import { UI_SANS_STACK } from '@/lib/font-registry';

/**
 * Every inline style the phone's tabs, forms and sheets share. The phone is
 * styled inline, so this file is its design tokens: a colour, a field, a
 * label or a button drawn in more than one place is named here once.
 *
 * Three field and label sets live side by side on purpose, because the pages
 * they belong to were each signed off with their own: `FIELD` / `FIELD_LABEL`
 * (chore, reward, routine, event and family forms), `SHEET_FIELD` /
 * `SHEET_LABEL` (the bottom sheets: Lists, Notes, Send alert, Rate dinner)
 * and `COMPACT_FIELD` / `COMPACT_LABEL` (meal forms, which are denser).
 * Making them one is a change to how those pages look, not a tidy-up.
 */

/**
 * The phone's one accent as a fill: the amber of a save button, a switch that
 * is on, a chosen chip's wash. Tints of it go through `withAlpha`, never a hex
 * suffix. As words or a thin line on the page it is `REMOTE_ACCENT_INK`.
 */
export const REMOTE_ACCENT = '#f59e0b';

/** Ink on an amber fill (a save button): dark, so it reads on amber in both themes. */
export const REMOTE_ON_ACCENT = 'var(--hs-on-warning)';

/**
 * Amber as words, an icon or a thin line on the page (a chosen chip's label
 * and edge, an amber heading, a chosen ring): the theme's amber ink, which is
 * a deeper amber in the light theme so small words still read on near-white.
 * Solid fills and soft washes stay `REMOTE_ACCENT`.
 */
export const REMOTE_ACCENT_INK = 'var(--hs-warning-ink)';

/**
 * The border, wash and ink of a chip or option button: amber when it is the
 * chosen one, quiet otherwise. `idleColor` is the unchosen ink, faint for a
 * filter chip and muted for a settings option. Size and shape stay with the
 * caller.
 */
export function selectedPillStyle(selected: boolean, idleColor = 'var(--hs-text-faint)'): React.CSSProperties {
  return {
    border: `1px solid ${selected ? REMOTE_ACCENT_INK : 'var(--hs-border)'}`,
    background: selected ? withAlpha(REMOTE_ACCENT, 0.15) : 'var(--hs-bg-panel)',
    color: selected ? REMOTE_ACCENT_INK : idleColor,
  };
}

/** The small count inside a chip (a list's open items, a folder's pictures): amber with its chip when chosen. */
export function chipCountStyle(selected: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 8,
    background: selected ? withAlpha(REMOTE_ACCENT, 0.22) : 'var(--hs-bg-card)',
    color: selected ? REMOTE_ACCENT_INK : 'var(--hs-text-muted)',
  };
}

/**
 * A 44 px pill that is on or off, or the picked one of a few (a timer look,
 * Sound, Wait for a Done tap, the walls a timer shows on, a new event's
 * calendar): amber when on, like every chosen chip. An icon or a colour dot
 * may sit beside its label. Spacing around it stays with the caller.
 */
export function toggleChipStyle(on: boolean): React.CSSProperties {
  return {
    minHeight: 44,
    padding: '0 14px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...selectedPillStyle(on, 'var(--hs-text-muted)'),
  };
}

/** A text box on a full-screen form: chores, rewards, routines. */
export const FIELD: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  padding: '12px 16px',
  background: 'var(--hs-bg-input)',
  border: '1px solid var(--hs-border)',
  borderRadius: 12,
  color: 'var(--hs-text-primary)',
  fontSize: 16,
  outline: 'none',
};

export const FIELD_SELECT: React.CSSProperties = {
  ...FIELD,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center',
  paddingRight: 40,
};

/** The heading over a field on a full-screen form. */
export const FIELD_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--hs-text-faint)',
  marginBottom: 8,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
};

/** The heading over a field in a bottom sheet. */
export const SHEET_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--hs-text-faint)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '14px 0 8px',
};

/** A text box in a bottom sheet: the form field, in the sheet's own font. */
export const SHEET_FIELD: React.CSSProperties = { ...FIELD, fontFamily: 'inherit' };

/**
 * A bare 44 px tall button around a smaller drawn control, so kids get a full
 * size tap target without the chips and icon buttons growing to match.
 */
export const HIT_TARGET: React.CSSProperties = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  height: 44,
  minWidth: 44,
  padding: 0,
  border: 'none',
  background: 'none',
  color: 'inherit',
  cursor: 'pointer',
};

export const SEGMENT_ROW: React.CSSProperties = { display: 'flex', gap: 6 };

/** One choice in a row of a few (a list's repeat, a note's life): lit in amber like every chosen chip. */
export function segmentStyle(on: boolean): React.CSSProperties {
  return {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    ...selectedPillStyle(on, 'var(--hs-text-muted)'),
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '0 6px',
  };
}

/** The round mark beside each answer in a pick-one list: an amber ring when chosen. */
export function radioRingStyle(on: boolean): React.CSSProperties {
  return {
    width: 20,
    height: 20,
    borderRadius: '50%',
    flexShrink: 0,
    boxSizing: 'border-box',
    border: on ? `6px solid ${REMOTE_ACCENT_INK}` : '2px solid var(--hs-border-strong)',
  };
}

/** The track of an on/off switch: amber when on, the one on colour every phone switch uses. */
export function switchTrackStyle(on: boolean): React.CSSProperties {
  return {
    position: 'relative',
    flex: 'none',
    width: 46,
    height: 28,
    borderRadius: 14,
    background: on ? REMOTE_ACCENT : 'var(--hs-border-strong)',
    transition: 'background 0.15s',
  };
}

/** The knob that slides along `switchTrackStyle`. */
export function switchKnobStyle(on: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    top: 3,
    left: on ? 21 : 3,
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
    transition: 'left 0.15s',
  };
}

const BUTTON_BASE: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 15,
  fontWeight: 700,
  marginTop: 8,
  cursor: 'pointer',
  fontFamily: 'inherit',
  border: 'none',
};

/** What the phone's main button is doing: ready to press, not pressable yet, or working. */
export type PrimaryButtonState = 'ready' | 'disabled' | 'busy';

/**
 * The phone's one "do it" button (save, add, send) in each of its states:
 * amber with dark ink when it can be pressed, grey when it cannot yet, and a
 * quieter amber while it works. `PrimaryButton` draws it with its busy words;
 * spread this only where the button is not a `<button>` (a link drawn as one).
 */
export function primaryButtonStyle(state: PrimaryButtonState = 'ready'): React.CSSProperties {
  if (state === 'disabled') {
    return { ...BUTTON_BASE, background: 'var(--hs-text-faint)', color: 'var(--hs-text-muted)', opacity: 0.5, cursor: 'default' };
  }
  return {
    ...BUTTON_BASE,
    background: REMOTE_ACCENT,
    color: REMOTE_ON_ACCENT,
    ...(state === 'busy' ? { opacity: 0.7, cursor: 'progress' } : {}),
  };
}

export const GHOST_BUTTON: React.CSSProperties = {
  ...BUTTON_BASE,
  background: 'var(--hs-bg-hover)',
  color: 'var(--hs-text-body)',
  fontWeight: 600,
  fontSize: 14,
};

/**
 * A quiet amber action beside the page's main one: an amber wash with amber
 * words (Timers' New routine, Meals' back to this week). Size, shape and
 * spacing stay with the caller.
 */
export const ACCENT_SOFT_BUTTON: React.CSSProperties = {
  border: 'none',
  background: withAlpha(REMOTE_ACCENT, 0.12),
  color: REMOTE_ACCENT_INK,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

/**
 * The quiet red button that deletes, removes or clears something: under a
 * form's save, at the foot of a sheet. Every delete on the phone that is not
 * a confirm sheet's own answer looks like this.
 */
export const DANGER_BUTTON: React.CSSProperties = {
  ...BUTTON_BASE,
  background: withAlpha('var(--hs-danger)', 0.12),
  color: 'var(--hs-danger)',
  fontSize: 14,
  fontWeight: 600,
};

export function swatchStyle(color: string, on: boolean): React.CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: color,
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    outline: on ? '3px solid var(--hs-text-primary)' : 'none',
    outlineOffset: 2,
    flex: 'none',
  };
}

export const HELPER_TEXT: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--hs-text-faint)',
  marginTop: 8,
  lineHeight: 1.4,
};

// Meal forms use slightly more compact inputs than chore forms
export const COMPACT_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--hs-text-muted)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  marginBottom: 6,
};

export const COMPACT_FIELD: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  minHeight: 44,
  fontSize: 14,
  background: 'var(--hs-bg-panel)',
  border: '1px solid var(--hs-border)',
  borderRadius: 10,
  color: 'var(--hs-text-primary)',
  outline: 'none',
  fontFamily: UI_SANS_STACK,
};

/** The small heading over a block of rows in the meal sheets. */
export const SECTION_HEADING: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'var(--hs-text-faint)',
  margin: '0 0 8px',
};

export const CARD: React.CSSProperties = {
  background: 'var(--hs-bg-card)',
  border: '1px solid var(--hs-border)',
  borderRadius: 12,
  padding: 14,
};

/** The small heading over a group of rows on the Rewards pages and the ticket history. Spacing stays with the caller. */
export const GROUP_HEADING: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hs-text-faint)',
};

/** The amber heading over a block on the Chores pages. Spacing stays with the caller. */
export const ACCENT_HEADING: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: REMOTE_ACCENT_INK,
};

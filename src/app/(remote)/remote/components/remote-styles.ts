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
 * (chore, reward and routine forms), `SHEET_FIELD` / `SHEET_LABEL` (the
 * sheets on Lists and Notes) and `COMPACT_FIELD` / `COMPACT_LABEL` (meal
 * forms, which are denser). Making them one is a change to how those pages
 * look, not a tidy-up.
 */

/**
 * The phone's one accent: the amber of a lit chip, a save button, a section
 * heading. Tints of it go through `withAlpha`, never a hex suffix.
 */
export const REMOTE_ACCENT = '#f59e0b';

/**
 * The border, wash and ink of a chip or option button: amber when it is the
 * chosen one, quiet otherwise. `idleColor` is the unchosen ink, faint for a
 * filter chip and muted for a settings option. Size and shape stay with the
 * caller.
 */
export function selectedPillStyle(selected: boolean, idleColor = 'var(--hs-text-faint)'): React.CSSProperties {
  return {
    border: `1px solid ${selected ? REMOTE_ACCENT : 'var(--hs-border)'}`,
    background: selected ? withAlpha(REMOTE_ACCENT, 0.15) : 'var(--hs-bg-panel)',
    color: selected ? REMOTE_ACCENT : idleColor,
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

export function segmentStyle(on: boolean): React.CSSProperties {
  return {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    border: `1px solid ${on ? 'var(--hs-accent)' : 'var(--hs-border-strong)'}`,
    background: on ? 'var(--hs-accent)' : 'var(--hs-bg-input)',
    color: on ? '#fff' : 'var(--hs-text-muted)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '0 6px',
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

export const PRIMARY_BUTTON: React.CSSProperties = {
  ...BUTTON_BASE,
  background: 'var(--hs-accent)',
  color: '#fff',
};

export const GHOST_BUTTON: React.CSSProperties = {
  ...BUTTON_BASE,
  background: 'var(--hs-bg-hover)',
  color: 'var(--hs-text-body)',
  fontWeight: 600,
  fontSize: 14,
};

export const DANGER_BUTTON: React.CSSProperties = {
  ...BUTTON_BASE,
  background: 'transparent',
  color: 'var(--hs-danger)',
  border: '1px solid color-mix(in srgb, var(--hs-danger) 35%, transparent)',
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

export function personChipStyle(on: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    padding: '0 12px 0 8px',
    borderRadius: 18,
    border: `1px solid ${on ? 'var(--hs-text-primary)' : 'var(--hs-border-strong)'}`,
    background: on ? 'var(--hs-bg-card)' : 'var(--hs-bg-input)',
    color: 'var(--hs-text-body)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
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
  color: REMOTE_ACCENT,
};

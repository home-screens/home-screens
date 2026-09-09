import type React from 'react';

/** Inline styles shared by the Lists tab and its sheets (mockup: todo-lists-v2). */

export const SHEET_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--hs-text-faint)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '14px 0 8px',
};

export const SHEET_FIELD: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  borderRadius: 12,
  background: 'var(--hs-bg-input)',
  border: '1px solid var(--hs-border)',
  padding: '12px 16px',
  fontSize: 16,
  color: 'var(--hs-text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
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

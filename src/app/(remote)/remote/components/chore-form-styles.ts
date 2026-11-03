import type React from 'react';
import { withAlpha } from '@/lib/hex-color';

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

export const INPUT_STYLE: React.CSSProperties = {
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

export const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center',
  paddingRight: 40,
};

export const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--hs-text-faint)',
  marginBottom: 8,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
};

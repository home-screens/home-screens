'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useTranslate } from '@/i18n';
import { primaryButtonStyle } from './remote-styles';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Working on it: the button reads `busyLabel` ("Saving…" unless the caller
   * says what it is doing), cannot be pressed a second time and tells a
   * screen reader it is busy.
   */
  busy?: boolean;
  busyLabel?: ReactNode;
  /**
   * As wide as its words and 44 px tall rather than a full-width 48: the one
   * button under an empty page, or a Start beside the boxes in a row.
   */
  compact?: boolean;
}

const COMPACT: CSSProperties = { width: 'auto', minHeight: 44, marginTop: 0, padding: '0 24px', fontSize: 14 };

/**
 * The phone's one "do it" button: every save, add and send on /remote and
 * /chores, amber with dark ink. Its ready, disabled and busy looks come from
 * `primaryButtonStyle`, so a caller passes `disabled` and `busy` and never
 * picks an opacity of its own. `style` is for spacing and width only.
 */
export default function PrimaryButton({
  busy = false,
  busyLabel,
  compact = false,
  disabled = false,
  children,
  style,
  className = 'press-btn',
  type = 'button',
  ...rest
}: PrimaryButtonProps) {
  const tCore = useTranslate('core');
  const state = busy ? 'busy' : disabled ? 'disabled' : 'ready';
  return (
    <button
      {...rest}
      type={type}
      className={className}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      style={{ ...primaryButtonStyle(state), ...(compact ? COMPACT : null), ...style }}
    >
      {busy ? busyLabel ?? tCore('status.saving') : children}
    </button>
  );
}

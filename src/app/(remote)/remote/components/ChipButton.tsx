'use client';

import type { CSSProperties, ReactNode } from 'react';
import { HIT_TARGET, selectedPillStyle } from './remote-styles';

/** How tall the drawn chip is; the button around it is the 44 px `HIT_TARGET`. */
export const CHIP_HEIGHT = 36;

/**
 * A chip a finger can hit: the 36 px pill is drawn inside a bare 44 px tall
 * button, so a row of filters keeps its look while small fingers get a full
 * size target. With `selected` it is a toggle (`aria-pressed`, lit amber
 * when on, `selectedPillStyle`); without it, a plain action pill.
 *
 * `chipStyle` changes the drawn pill (its padding, text size or colours);
 * `style` changes the button around it (its margins, `flex`).
 */
export default function ChipButton({
  selected,
  onClick,
  icon,
  children,
  disabled = false,
  ariaLabel,
  title,
  testId,
  chipStyle,
  style,
}: {
  selected?: boolean;
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  testId?: string;
  chipStyle?: CSSProperties;
  style?: CSSProperties;
}) {
  const toggle = selected !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={toggle ? selected : undefined}
      aria-label={ariaLabel}
      title={title}
      data-testid={testId}
      className="press-scale-sm"
      style={{ ...HIT_TARGET, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, ...style }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: CHIP_HEIGHT,
          padding: '0 14px',
          borderRadius: 999,
          fontSize: toggle ? 12 : 14,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
          ...(toggle
            ? selectedPillStyle(selected)
            : { border: '1px solid var(--hs-border-strong)', background: 'var(--hs-bg-panel)', color: 'var(--hs-text-body)' }),
          ...chipStyle,
        }}
      >
        {icon}
        {children}
      </span>
    </button>
  );
}

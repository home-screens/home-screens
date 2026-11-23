'use client';

import type { ButtonHTMLAttributes } from 'react';
import { Plus } from 'lucide-react';
import { REMOTE_ACCENT, REMOTE_ON_ACCENT } from './remote-styles';

/** Side of the square: the height of the add box it sits beside. */
export const SQUARE_ADD_SIZE = 48;

interface SquareAddButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'style' | 'aria-label'> {
  /** What a screen reader says, since the button shows only a plus. */
  label: string;
  /** Nothing typed yet: drawn quiet instead of amber. */
  idle?: boolean;
  /** An add is on its way: the button fades and says it is busy. */
  busy?: boolean;
  testId?: string;
}

/**
 * The square amber + at the end of a phone add box (the Lists and Notes add
 * bar, the Mealie grocery list): type, then tap it or press Return. One size
 * and one look wherever a box takes new items. A submit button unless the
 * caller says otherwise.
 */
export default function SquareAddButton({
  label,
  idle = false,
  busy = false,
  testId,
  disabled = false,
  type = 'submit',
  className = 'press-btn',
  ...rest
}: SquareAddButtonProps) {
  const pressable = !idle && !busy && !disabled;
  return (
    <button
      {...rest}
      type={type}
      className={className}
      disabled={disabled}
      aria-label={label}
      aria-busy={busy || undefined}
      data-testid={testId}
      style={{
        width: SQUARE_ADD_SIZE,
        height: SQUARE_ADD_SIZE,
        flex: 'none',
        padding: 0,
        borderRadius: 12,
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: idle ? 'var(--hs-bg-card)' : REMOTE_ACCENT,
        color: idle ? 'var(--hs-text-faint)' : REMOTE_ON_ACCENT,
        opacity: busy ? 0.6 : 1,
        cursor: pressable ? 'pointer' : 'default',
      }}
    >
      <Plus size={24} aria-hidden />
    </button>
  );
}

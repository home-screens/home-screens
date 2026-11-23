'use client';

import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import { X, type LucideIcon } from 'lucide-react';

/**
 * A small button that is only an icon: remove a row, delete a record, close
 * a notice. `label` is required because the icon says nothing to a screen
 * reader; it is also the hover tooltip.
 *
 * - `icon` is a lucide icon, `X` by default (`Trash2` for something deleted
 *   for good, `Pencil` to edit).
 * - `tone="danger"` (the default) turns red on hover, for removing;
 *   `neutral` for anything else.
 * - `size="sm"` is 24px for rows in the property panel; `md` is 28px.
 */
export default function IconButton({
  label,
  icon: Icon = X,
  size = 'sm',
  tone = 'danger',
  className,
  type = 'button',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  label: string;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
  tone?: 'danger' | 'neutral';
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded text-hs-text-faint transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-6 w-6' : 'h-7 w-7',
        tone === 'danger'
          ? 'enabled:hover:bg-hs-danger/10 enabled:hover:text-hs-danger'
          : 'enabled:hover:bg-hs-card enabled:hover:text-hs-text-body',
        className,
      )}
      {...rest}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
    </button>
  );
}

'use client';

import { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost';
  size?: 'sm' | 'md';
}

const variantStyles = {
  primary: 'bg-hs-accent hover:bg-hs-accent-hover text-white',
  secondary: 'bg-hs-card hover:bg-hs-hover text-hs-text-body border border-hs-border-strong',
  danger: 'bg-hs-danger hover:opacity-90 text-white',
  /** The one next step inside a warning notice. */
  warning: 'bg-hs-warning hover:opacity-90 text-hs-on-warning font-semibold',
  ghost: 'text-hs-text-muted hover:text-hs-text-body hover:bg-hs-card',
};

export default function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'rounded-md font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        className,
      )}
      {...props}
    />
  );
}

'use client';

import { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}

const variantStyles = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white',
  secondary: 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
  ghost: 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800',
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
        'rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        className,
      )}
      {...props}
    />
  );
}

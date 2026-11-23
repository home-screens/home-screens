'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import StatusDot, { type StatusTone } from './StatusDot';

const TONES: Record<StatusTone, { border: string; body: string }> = {
  success: { border: 'border-hs-success/30', body: 'bg-hs-success/10 text-hs-success' },
  warning: { border: 'border-hs-warning/30', body: 'bg-hs-warning/10 text-hs-warning-ink' },
  danger: { border: 'border-hs-danger/30', body: 'bg-hs-danger/10 text-hs-danger' },
  info: { border: 'border-hs-accent/30', body: 'bg-hs-accent/10 text-hs-accent-hover' },
  neutral: { border: 'border-hs-border-strong', body: 'bg-hs-card text-hs-text-muted' },
};

/**
 * Border, fill and ink of each tone, for the one pill that lays out its own
 * shape (an integration card's status, which shrinks to its dot when narrow).
 */
export const STATUS_PILL_TONE_CLASS: Record<StatusTone, string> = Object.fromEntries(
  Object.entries(TONES).map(([tone, { border, body }]) => [tone, `${border} ${body}`]),
) as Record<StatusTone, string>;

const SIZE = {
  sm: { box: 'gap-1 px-1.5 py-px text-[10px]', icon: 'h-2.5 w-2.5' },
  md: { box: 'gap-1.5 px-2 py-0.5 text-[11px]', icon: 'h-3 w-3' },
} as const;

/**
 * The small tinted label that says how something stands: "Connected",
 * "Beta", "Update waiting", "Throttled now". Each tone has one strength (the
 * same as `Notice`), so a warning pill on one card matches the one on the
 * next, and the tones mean what `StatusDot`'s do.
 *
 * - `size="sm"` sits beside a name in a row or a tab; `md` (the default)
 *   stands on its own in a card or a header.
 * - `dot` puts the tone's `StatusDot` in front (`'pulse'` for something live
 *   right now); `icon` puts a small lucide icon there instead.
 * - `bordered={false}` drops the outline, for a state that has not begun yet
 *   (a display that has never checked in), so it does not read the same as
 *   one that went quiet.
 *
 * `className` is for placement and text treatment (a margin, a strike-through),
 * never colour or size.
 */
export default function StatusPill({
  tone,
  size = 'md',
  dot,
  icon: Icon,
  bordered = true,
  className,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLSpanElement>, 'className' | 'children'> & {
  tone: StatusTone;
  size?: 'sm' | 'md';
  dot?: boolean | 'pulse';
  icon?: LucideIcon;
  bordered?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const look = TONES[tone];
  const shape = SIZE[size];
  return (
    <span
      {...rest}
      data-status-pill={tone}
      className={clsx(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full border font-medium leading-tight',
        shape.box,
        bordered ? look.border : 'border-transparent',
        look.body,
        className,
      )}
    >
      {dot && <StatusDot tone={tone} size="sm" pulse={dot === 'pulse'} />}
      {!dot && Icon && <Icon className={clsx('shrink-0', shape.icon)} strokeWidth={3} aria-hidden="true" />}
      {children}
    </span>
  );
}

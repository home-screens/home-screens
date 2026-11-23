'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

export type NoticeTone = 'warning' | 'danger' | 'success' | 'info';

const TONES: Record<NoticeTone, { box: string; ink: string }> = {
  warning: { box: 'border-hs-warning/30 bg-hs-warning/10', ink: 'text-hs-warning-ink' },
  danger: { box: 'border-hs-danger/30 bg-hs-danger/10', ink: 'text-hs-danger' },
  success: { box: 'border-hs-success/30 bg-hs-success/10', ink: 'text-hs-success' },
  info: { box: 'border-hs-accent/30 bg-hs-accent/10', ink: 'text-hs-accent-hover' },
};

/**
 * The tinted box the editor uses to say something went wrong, needs doing,
 * or worked: one strength per tone, so a warning on the System page looks
 * like a warning on the Data page.
 *
 * - Without a `title`, the words are in the tone's colour (a one-line "That
 *   link didn't answer").
 * - With a `title`, the title carries the colour and the words under it are
 *   plain body text, easier to read at length.
 * - `action` holds the one next step, usually `<Button variant="warning"
 *   size="sm">`, on the right while it fits and underneath when it doesn't.
 * - `size="sm"` is for the property panel and inline rows; `md` (the default)
 *   for Settings pages and windows.
 *
 * `className` is for placement only (margins, width).
 */
export default function Notice({
  tone,
  title,
  icon: Icon,
  action,
  size = 'md',
  role,
  className,
  testId,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'title' | 'className' | 'children'> & {
  tone: NoticeTone;
  title?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  size?: 'sm' | 'md';
  /** `alert` for a failure the person has to know about now; `status` for news they can read when they like. */
  role?: 'status' | 'alert';
  className?: string;
  testId?: string;
  children?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div
      {...rest}
      role={role}
      data-testid={testId}
      data-notice={tone}
      className={clsx(
        'flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border leading-relaxed',
        size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs',
        t.box,
        className,
      )}
    >
      {Icon && <Icon className={clsx('mt-0.5 shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5', t.ink)} aria-hidden />}
      <div className={clsx('min-w-0 flex-1 basis-48', title ? 'text-hs-text-secondary' : t.ink)}>
        {title && <p className={clsx('font-medium', t.ink)}>{title}</p>}
        {children}
      </div>
      {action != null && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

'use client';

import clsx from 'clsx';
import { useTranslate } from '@/i18n';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const FILL: Record<StatusTone, string> = {
  success: 'bg-hs-success',
  warning: 'bg-hs-warning',
  danger: 'bg-hs-danger',
  info: 'bg-hs-accent',
  neutral: 'bg-hs-text-faint',
};

/**
 * The one coloured dot that says how something is doing: fine (`success`),
 * needs a look (`warning`), broken (`danger`), on its way (`info`) or not
 * known (`neutral`). Drawn from the theme's status colours, so a fine
 * display is the same green on every card and in both themes. `pulse` is for
 * something live right now; it holds still for reduced motion. Decorative:
 * the words beside it carry the meaning.
 */
export default function StatusDot({
  tone,
  pulse = false,
  size = 'md',
  className,
}: {
  tone: StatusTone;
  pulse?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const box = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';
  return (
    <span className={clsx('relative inline-flex shrink-0', box, className)} aria-hidden="true">
      {pulse && <span className={clsx('absolute inset-0 rounded-full opacity-60 animate-ping motion-reduce:animate-none', FILL[tone])} />}
      <span className={clsx('relative rounded-full', box, FILL[tone])} />
    </span>
  );
}

/** "Configured" / "Not configured" beside a key or account, with its dot. */
export function ConfiguredStatus({ configured }: { configured: boolean }) {
  const t = useTranslate('editor');
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <StatusDot tone={configured ? 'success' : 'neutral'} size="sm" />
      <span className={configured ? 'text-hs-success' : 'text-hs-text-faint'}>
        {configured ? t('statusDot.configured') : t('statusDot.notConfigured')}
      </span>
    </span>
  );
}

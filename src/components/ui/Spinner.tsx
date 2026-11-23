'use client';

import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { useTranslate } from '@/i18n';

const SIZES = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-8 w-8' } as const;

/**
 * The editor's one "working on it" spinner: a lucide `Loader2` turning in
 * the colour of the text around it. Decorative; say what is happening in
 * words beside it, or use `LoadingLine`. `sm` sits inside a button or a
 * line of text, `lg` alone in an empty space.
 */
export default function Spinner({ size = 'sm', className }: { size?: keyof typeof SIZES; className?: string }) {
  return <Loader2 className={clsx('shrink-0 animate-spin', SIZES[size], className)} aria-hidden />;
}

/**
 * "Loading…" (or what is being waited for) with the spinner in front, as a
 * live region so a screen reader hears it. One size across the editor; the
 * caller places it (`className`) and may centre it.
 */
export function LoadingLine({
  label,
  align = 'start',
  className,
  testId,
}: {
  /** What is being waited for; "Loading…" when left out. */
  label?: string;
  align?: 'start' | 'center';
  className?: string;
  testId?: string;
}) {
  const tCore = useTranslate('core');
  return (
    <p
      role="status"
      data-testid={testId}
      className={clsx('flex items-center gap-2 text-xs text-hs-text-faint', align === 'center' && 'justify-center', className)}
    >
      <Spinner />
      {label ?? tCore('loading')}
    </p>
  );
}

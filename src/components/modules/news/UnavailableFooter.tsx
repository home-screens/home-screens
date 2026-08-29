'use client';

import type { TranslateFn } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';

/** Quiet one-liner naming feeds that did not answer this refresh. */
export function UnavailableFooter({ labels, t }: { labels: string[]; t: TranslateFn }) {
  if (labels.length === 0) return null;
  return (
    <div
      data-news-unavailable
      className="shrink-0 truncate pt-1"
      style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}
    >
      {t('news.unavailable', { feeds: labels.join(', ') })}
    </div>
  );
}

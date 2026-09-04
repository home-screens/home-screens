'use client';

import type { CSSProperties } from 'react';
import type { TranslateFn } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';

/**
 * Quiet one-liner naming feeds that did not answer this refresh. The tile
 * sizes it relative to its own type; the full-screen views pass an explicit
 * size in canvas units through `style`.
 */
export function UnavailableFooter({ labels, t, style }: { labels: string[]; t: TranslateFn; style?: CSSProperties }) {
  if (labels.length === 0) return null;
  return (
    <div
      data-news-unavailable
      className="shrink-0 truncate pt-1"
      style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary, ...style }}
    >
      {t('news.unavailable', { feeds: labels.join(', ') })}
    </div>
  );
}

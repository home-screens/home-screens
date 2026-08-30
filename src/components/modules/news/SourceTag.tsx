'use client';

import type { TranslateFn } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import type { NewsDisplayItem } from '@/lib/news/types';

/**
 * "● BBC News · 2h ago  Just in" — the meta line under a headline. The dot
 * takes the feed's colour when one is set, so a five-feed list stays
 * scannable without per-source logos.
 */
export function SourceTag({
  item, parts, breaking, isNew, accentColor, t, className, size = 'sm',
}: {
  item: NewsDisplayItem;
  parts: string[];
  breaking: boolean;
  isNew: boolean;
  accentColor?: string;
  t: TranslateFn;
  className?: string;
  size?: 'sm' | 'xs';
}) {
  if (parts.length === 0 && !breaking && !isNew) return null;
  const fontSize = size === 'xs' ? '0.65em' : '0.75em';
  const marker = accentColor ?? '#f59e0b';
  return (
    <span
      className={`inline-flex items-center gap-1.5 min-w-0 ${className ?? ''}`}
      style={{ fontSize, opacity: TEXT_OPACITY.secondary }}
    >
      {item.sourceColor && parts.length > 0 && (
        <span
          aria-hidden
          className="inline-block rounded-full shrink-0"
          style={{ width: '0.55em', height: '0.55em', backgroundColor: item.sourceColor }}
        />
      )}
      {parts.length > 0 && <span className="truncate">{parts.join(' · ')}</span>}
      {breaking && (
        <span
          data-news-breaking
          className="shrink-0 rounded-full px-1.5 uppercase tracking-wider font-semibold"
          style={{ fontSize: '0.8em', lineHeight: 1.6, color: marker, border: `1px solid ${marker}` }}
        >
          {t('news.justIn')}
        </span>
      )}
      {isNew && !breaking && (
        <span
          data-news-new
          title={t('news.newStory')}
          aria-label={t('news.newStory')}
          className="inline-block rounded-full shrink-0"
          style={{ width: '0.5em', height: '0.5em', backgroundColor: marker }}
        />
      )}
    </span>
  );
}

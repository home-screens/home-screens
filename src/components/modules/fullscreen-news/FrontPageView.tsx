'use client';

import { useTZClock } from '@/hooks/useTZClock';
import type { NewsDisplayItem } from '@/lib/news/types';
import { clampLines, formatNewsAge, metaParts } from '../news/news-shared';
import { StoryButton } from '../news/StoryButton';
import { Thumbnail } from '../news/Thumbnail';
import { UnavailableFooter } from '../news/UnavailableFooter';
import { FRONT_PAGE_SIZE, type NewsViewContext } from './news-canvas';
import { PageDots, SourceMeta } from './news-parts';

/** Share of the canvas height the lead picture takes. */
const LEAD_IMAGE_SHARE = 0.36;
const LEAD_IMAGE_SHARE_LANDSCAPE = 0.4;

/**
 * A newspaper front page: masthead, one lead story, and the next five in a
 * grid (two columns of thumbnail-left cards in portrait, three columns of
 * picture-on-top cards in landscape). Pages through the list six at a time.
 */
export default function FrontPageView({
  page, pageCount, title, ctx,
}: {
  page: number;
  pageCount: number;
  title: string;
  ctx: NewsViewContext;
}) {
  const { items, scale, theme, accent, options, onTap, t, locale, timezone, unavailable } = ctx;
  const { bu, s } = scale;
  const landscape = scale.orientation === 'landscape';
  const start = page * FRONT_PAGE_SIZE;
  const lead = items[start];
  const rest = items.slice(start + 1, start + FRONT_PAGE_SIZE);
  if (!lead) return null;

  const leadImageHeight = scale.height * (landscape ? LEAD_IMAGE_SHARE_LANDSCAPE : LEAD_IMAGE_SHARE);

  const leadBlock = (
    <StoryButton
      item={lead}
      onTap={onTap}
      className={landscape ? 'flex flex-col min-h-0 shrink-0 w-[44%]' : 'flex flex-col min-h-0 shrink-0 w-full'}
    >
      {options.showImages && (
        <Thumbnail
          item={lead}
          accentColor={accent}
          rounded={`${bu * 1.85}px`}
          className="w-full"
          style={{ height: leadImageHeight, fontSize: s * 6 }}
        />
      )}
      <SourceMeta item={lead} ctx={ctx} size={s * 2.4} style={{ marginTop: bu * 2.2 }} />
      <h2
        data-news-headline
        className="font-bold m-0"
        style={{
          fontSize: s * (landscape ? 4.3 : 5),
          lineHeight: 1.1,
          letterSpacing: '-0.015em',
          marginTop: bu * 1.5,
          color: theme.text,
          ...clampLines(3),
        }}
      >
        {lead.title}
      </h2>
      {options.showDescription && lead.description && (
        <p
          data-news-description
          className="m-0"
          style={{
            fontSize: s * (landscape ? 2.4 : 2.6),
            lineHeight: 1.45,
            marginTop: bu * 1.3,
            color: theme.textSecondary,
            ...clampLines(landscape ? 2 : 3),
          }}
        >
          {lead.description}
        </p>
      )}
    </StoryButton>
  );

  const grid = rest.length > 0 && (
    <div
      data-news-grid
      className="grid flex-1 min-h-0 overflow-hidden"
      style={landscape
        ? { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 1fr)', gap: `${bu * 2.6}px ${bu * 2.4}px` }
        : { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 1fr)', gap: `${bu * 2}px ${bu * 3}px` }}
    >
      {rest.map((item, i) => {
        // An odd fifth card spans both portrait columns so the page never ends
        // on a lonely half-row.
        const wide = !landscape && i === rest.length - 1 && rest.length % 2 === 1;
        return (
          <GridCard key={`${item.feedId} ${item.id}`} item={item} ctx={ctx} wide={wide} landscape={landscape} />
        );
      })}
    </div>
  );

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ padding: landscape ? `${bu * 4}px ${bu * 5.9}px ${bu * 3.7}px` : `${bu * 5.2}px ${bu * 5.9}px` }}
    >
      <Masthead title={title} ctx={ctx} timezone={timezone} locale={locale} />
      {landscape ? (
        <div className="flex flex-1 min-h-0" style={{ gap: bu * 4.4, marginTop: bu * 2.6 }}>
          {leadBlock}
          {grid}
        </div>
      ) : (
        <>
          <div style={{ marginTop: bu * 3 }} />
          {leadBlock}
          <div className="shrink-0" style={{ height: 1, backgroundColor: theme.border, margin: `${bu * 2.8}px 0 ${bu * 2.4}px` }} />
          {grid}
        </>
      )}
      <PageDots count={pageCount} index={page} ctx={ctx} style={{ marginTop: bu * (landscape ? 1.7 : 2.4) }} />
      {/* Colour is inherited (theme.text) and dimmed by the footer's own
          tertiary opacity, exactly as on the news tile. */}
      <UnavailableFooter labels={unavailable} t={t} style={{ fontSize: s * 2, marginTop: bu * 1.3, textAlign: 'center' }} />
    </div>
  );
}

function Masthead({ title, ctx, timezone, locale }: { title: string; ctx: NewsViewContext; timezone?: string; locale: string }) {
  const { scale, theme, accent, options } = ctx;
  const { bu, s } = scale;
  const now = useTZClock(timezone, 60_000);
  const date = options.showTime ? now.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  // The last word of the masthead takes the accent, newspaper-style, when
  // there is more than one word ("BBC News" reads as BBC + News).
  const words = title.trim().split(/\s+/);
  const head = words.length > 1 ? words.slice(0, -1).join(' ') + ' ' : '';
  const tail = words[words.length - 1] ?? '';

  return (
    <div
      data-news-masthead
      className="flex items-baseline justify-between shrink-0"
      style={{
        borderTop: `${Math.max(2, bu * 0.37)}px solid ${theme.text}`,
        borderBottom: `1px solid ${theme.border}`,
        padding: `${bu * 1.7}px 0 ${bu * 1.5}px`,
        gap: bu * 3,
      }}
    >
      <span
        className="truncate min-w-0 font-extrabold uppercase"
        style={{ fontSize: s * 3.1, letterSpacing: '0.14em', color: theme.text }}
      >
        {head}<span style={{ color: accent }}>{tail}</span>
      </span>
      {date && (
        <span className="shrink-0 font-medium" style={{ fontSize: s * 2.4, color: theme.textSecondary }}>{date}</span>
      )}
    </div>
  );
}

function GridCard({ item, ctx, wide, landscape }: { item: NewsDisplayItem; ctx: NewsViewContext; wide: boolean; landscape: boolean }) {
  const { scale, theme, accent, options, onTap, t, locale, now } = ctx;
  const { bu, s } = scale;
  const meta = metaParts(item, options, formatNewsAge(item.timestamp, t, locale, now)).join(' · ');
  const thumbSize = bu * 13.9;

  return (
    <StoryButton
      item={item}
      onTap={onTap}
      className={landscape ? 'flex flex-col min-h-0 min-w-0 overflow-hidden' : 'flex min-h-0 min-w-0 overflow-hidden'}
      style={{ gap: landscape ? bu * 1.5 : bu * 1.85, gridColumn: wide ? '1 / -1' : undefined }}
    >
      {options.showImages && (
        <Thumbnail
          item={item}
          accentColor={accent}
          rounded={`${bu * 1.3}px`}
          style={landscape
            ? { width: '100%', height: bu * 17.6, maxHeight: '60%', fontSize: s * 3 }
            : { width: wide ? thumbSize * 1.47 : thumbSize, height: thumbSize, maxHeight: '100%', fontSize: s * 3 }}
        />
      )}
      <div className="flex flex-col min-w-0 min-h-0">
        <h3
          data-news-headline
          className="font-semibold m-0"
          style={{ fontSize: s * 2.5, lineHeight: 1.22, letterSpacing: '-0.01em', color: theme.text, ...clampLines(3) }}
        >
          {item.title}
        </h3>
        {meta && (
          <div className="flex items-center min-w-0" style={{ gap: bu, marginTop: bu * 0.75, fontSize: s * 1.95, color: theme.textMuted }}>
            {options.showSource && item.sourceColor && (
              <span aria-hidden="true" className="rounded-full shrink-0" style={{ width: bu, height: bu, backgroundColor: item.sourceColor }} />
            )}
            <span className="truncate">{meta}</span>
          </div>
        )}
      </div>
    </StoryButton>
  );
}

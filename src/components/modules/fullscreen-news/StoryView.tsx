'use client';

import type { CSSProperties } from 'react';
import type { NewsDisplayItem } from '@/lib/news/types';
import { useStoryImage } from '../news/news-hooks';
import { clampLines, sourceInitial } from '../news/news-shared';
import { StoryButton } from '../news/StoryButton';
import { sourceTint, themeBgAlpha, type NewsViewContext } from './news-canvas';
import { ClockCorner, SourceMeta, StoryProgress } from './news-parts';

/** Share of the canvas the hero takes: with a picture, and without one. */
const HERO_SHARE = 0.55;
const HERO_SHARE_NO_IMAGE = 0.34;
const HERO_SHARE_LANDSCAPE_NO_IMAGE = 0.4;

/**
 * One story at a time. The story image fills the top of the canvas (the
 * left in landscape) and, blurred and scrimmed in the theme colour, the
 * whole backdrop; the headline and summary sit below it. A story without a
 * picture gets a shorter tinted band carrying the source initial, so the
 * text moves up. Stories swap in place: no enter or exit animation.
 */
export default function StoryView({ item, index, ctx }: { item: NewsDisplayItem; index: number; ctx: NewsViewContext }) {
  const { items, scale, theme, options, onTap, locale, timezone, timeFormat } = ctx;
  const { bu, s } = scale;
  const landscape = scale.orientation === 'landscape';

  // A picture that fails to load retries the feed's own URL, then falls back
  // to the no-image layout for that story only; the next story starts fresh.
  const { src, onError } = useStoryImage(item);
  const imageUrl = options.showImages ? src : null;

  const heroShare = imageUrl ? HERO_SHARE : landscape ? HERO_SHARE_LANDSCAPE_NO_IMAGE : HERO_SHARE_NO_IMAGE;
  const heroPct = `${heroShare * 100}%`;
  const bg = theme.bg;
  const bgAlpha = (a: number) => themeBgAlpha(theme, a);

  // The scrim rises from the text side toward the image so the headline
  // always sits on solid theme colour, then thins out over the picture.
  const scrim = landscape
    ? `linear-gradient(to left, ${bg} 0%, ${bg} 40%, ${bgAlpha(0.5)} 62%, ${bgAlpha(0.1)} 100%)`
    : `linear-gradient(to top, ${bg} 0%, ${bg} 42%, ${bgAlpha(0.55)} 62%, ${bgAlpha(0.15)} 100%)`;
  const fade = landscape
    ? `linear-gradient(to right, ${bgAlpha(0)} 0%, ${bgAlpha(0.85)} 100%)`
    : `linear-gradient(to bottom, ${bgAlpha(0)} 0%, ${bgAlpha(0.85)} 100%)`;

  const heroStyle: CSSProperties = landscape
    ? { left: 0, top: 0, bottom: 0, width: heroPct }
    : { left: 0, right: 0, top: 0, height: heroPct };
  const bodyStyle: CSSProperties = landscape
    ? { left: heroPct, top: 0, right: 0, bottom: 0, padding: `${bu * 5.9}px ${bu * 6.7}px ${bu * 5.9}px ${bu * 3}px`, justifyContent: 'center' }
    : { left: 0, right: 0, top: heroPct, bottom: 0, padding: `${bu * 3.7}px ${bu * 5.9}px ${bu * 5.9}px` };

  const tint = sourceTint(item, ctx.accent);
  const clockInk = imageUrl ? '#ffffff' : theme.text;

  return (
    <StoryButton item={item} onTap={onTap} className="absolute inset-0 block w-full h-full overflow-hidden">
      {/* Backdrop: the story image blurred into the theme, or the theme's own atmosphere. */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="absolute max-w-none object-cover"
          style={{ top: '-8%', left: '-8%', width: '116%', height: '116%', filter: 'blur(40px) saturate(1.2)', opacity: 0.9 }}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundImage: theme.bgImage ?? 'none' }} />
      )}
      <div className="absolute inset-0" style={{ background: scrim }} />

      {/* Hero: the picture, or a tinted band with the source initial. */}
      <div data-news-hero={imageUrl ? 'image' : 'placeholder'} className="absolute overflow-hidden" style={heroStyle}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            decoding="async"
            onError={onError}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center font-extrabold select-none"
            style={{
              background: `linear-gradient(135deg, ${tint} 0%, ${theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'} 100%)`,
              fontSize: Math.min(scale.height, scale.width) * (landscape ? 0.34 : 0.3),
              letterSpacing: '-0.04em',
              opacity: 0.18,
              color: theme.text,
            }}
          >
            {sourceInitial(item)}
          </div>
        )}
        <div
          className="absolute"
          style={landscape
            ? { top: 0, bottom: 0, right: 0, width: '22%', background: fade }
            : { left: 0, right: 0, bottom: 0, height: '22%', background: fade }}
        />
        {options.showTime && (
          <ClockCorner
            timezone={timezone}
            timeFormat={timeFormat}
            locale={locale}
            size={s * 5.9}
            light={clockInk}
            style={{ position: 'absolute', top: bu * 5, left: bu * 5.9 }}
          />
        )}
      </div>

      <div className="absolute flex flex-col min-h-0" style={bodyStyle}>
        <SourceMeta item={item} ctx={ctx} size={s * 2.4} />
        <h2
          data-news-headline
          className="font-bold m-0"
          style={{
            fontSize: s * (landscape ? 5.2 : 5.7),
            lineHeight: 1.1,
            letterSpacing: '-0.015em',
            marginTop: bu * 2.4,
            color: theme.text,
            ...clampLines(4),
          }}
        >
          {item.title}
        </h2>
        {options.showDescription && item.description && (
          <p
            data-news-description
            className="m-0"
            style={{
              fontSize: s * (landscape ? 2.6 : 2.8),
              lineHeight: 1.45,
              marginTop: bu * 2,
              color: theme.textSecondary,
              ...clampLines(4),
            }}
          >
            {item.description}
          </p>
        )}
        <StoryProgress
          count={items.length}
          index={index}
          ctx={ctx}
          style={landscape ? { marginTop: bu * 4.4 } : { marginTop: 'auto', paddingTop: bu * 2 }}
        />
      </div>
    </StoryButton>
  );
}

'use client';

import type { CSSProperties } from 'react';
import type { NewsDisplayItem } from '@/lib/news/types';
import { useStoryImage } from './news-hooks';
import { sourceInitial } from './news-shared';
import { ink } from '@/lib/constants';

/**
 * Story image with a graceful fallback: a tinted block carrying the source
 * initial when the feed has no picture or the picture fails to load. Never
 * reserves space for a broken image.
 */
export function Thumbnail({
  item, className, style, accentColor, rounded = '0.4em',
}: {
  item: NewsDisplayItem;
  className?: string;
  style?: CSSProperties;
  accentColor?: string;
  rounded?: string;
}) {
  const { src, onError } = useStoryImage(item);
  const tint = item.sourceColor ?? accentColor ?? ink(0.18);

  return (
    <div
      data-news-thumb={src ? 'image' : 'placeholder'}
      className={`relative overflow-hidden shrink-0 ${className ?? ''}`}
      style={{ borderRadius: rounded, backgroundColor: ink(0.06), ...style }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={onError}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center font-bold select-none"
          style={{
            // The far stop stays a literal: a `color-mix()` stop would switch
            // the gradient to oklab interpolation (see `ink`), and at 3% it
            // is invisible on any card anyway.
            background: `linear-gradient(135deg, ${tint} 0%, rgba(255,255,255,0.03) 100%)`,
            fontSize: '1.6em',
            opacity: 0.7,
          }}
        >
          {sourceInitial(item)}
        </div>
      )}
    </div>
  );
}

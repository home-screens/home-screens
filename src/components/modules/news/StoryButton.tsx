'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { NewsDisplayItem } from '@/lib/news/types';

/**
 * A story row is a real <button> only when tapping does something; otherwise
 * a plain div, so read-only displays never expose focusable rows.
 */
export function StoryButton({
  item, onTap, className, style, children, label,
}: {
  item: NewsDisplayItem;
  onTap?: (item: NewsDisplayItem) => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** Accessible name for the button; defaults to the headline. */
  label?: string;
}) {
  if (!onTap) {
    return <div data-news-story className={className} style={style}>{children}</div>;
  }
  return (
    <button
      type="button"
      data-news-story
      onClick={() => onTap(item)}
      aria-label={label ?? item.title}
      className={`text-left appearance-none bg-transparent border-0 p-0 m-0 text-inherit font-inherit cursor-pointer ${className ?? ''}`}
      style={{ color: 'inherit', font: 'inherit', ...style }}
    >
      {children}
    </button>
  );
}

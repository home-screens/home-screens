'use client';

import { v4 as uuidv4 } from 'uuid';
import type { NewsFeedSource, NewsSourceOptions } from '@/types/config';
import { NewsFeedsEditor } from './NewsFeedsEditor';
import { NewsAddFeedMenu } from './NewsAddFeedMenu';
import { NewsPreview } from './NewsPreview';
import { NEWS_MAX_FEEDS } from './feed-display';

interface NewsSourcesFieldsProps {
  config: Partial<NewsSourceOptions>;
  set: (updates: Partial<NewsSourceOptions>) => void;
}

/** Feeds list, "Add a feed" menu, and live preview: the top of both news sections. */
export function NewsSourcesFields({ config, set }: NewsSourcesFieldsProps) {
  const feeds = config.feeds ?? [];
  const addFeed = (feed: Omit<NewsFeedSource, 'id'>) => {
    if (feeds.length >= NEWS_MAX_FEEDS) return;
    set({ feeds: [...feeds, { id: uuidv4(), ...feed }] });
  };
  return (
    <>
      <NewsFeedsEditor feeds={feeds} onChange={(next) => set({ feeds: next })} />
      <NewsAddFeedMenu feeds={feeds} onAdd={addFeed} />
      <NewsPreview config={config} />
    </>
  );
}

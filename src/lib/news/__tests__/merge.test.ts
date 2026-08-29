import { describe, it, expect } from 'vitest';
import type { NewsFeedSource } from '@/types/config';
import { failedFeeds, mergeFeeds, parseWordList, type FeedWithResult } from '../merge';
import type { NewsFeedResult, NewsItem } from '../types';

const NOW = Date.UTC(2026, 7, 29, 12);
const HOUR = 3_600_000;

let counter = 0;
function item(overrides: Partial<NewsItem> = {}): NewsItem {
  counter++;
  return {
    id: `id-${counter}`,
    title: `Story ${counter}`,
    link: `https://example.com/${counter}`,
    description: '',
    timestamp: NOW - counter * HOUR,
    imageUrl: null,
    ...overrides,
  };
}

function feed(id: string, overrides: Partial<NewsFeedSource> = {}): NewsFeedSource {
  return { id, url: `https://${id}.example.com/rss`, ...overrides };
}

function ok(feedSource: NewsFeedSource, items: NewsItem[], title = `${feedSource.id} title`): FeedWithResult {
  const result: NewsFeedResult = { url: feedSource.url, ok: true, title, format: 'rss', items, fetchedAt: NOW };
  return { feed: feedSource, result };
}

function failed(feedSource: NewsFeedSource): FeedWithResult {
  return { feed: feedSource, result: { url: feedSource.url, ok: false, error: 'http-error', status: 500, items: [], fetchedAt: NOW } };
}

describe('parseWordList', () => {
  it('splits on commas, newlines, and semicolons; lowercases; trims; dedupes', () => {
    expect(parseWordList('Shooting, war\nLayoffs; WAR ;  ')).toEqual(['shooting', 'war', 'layoffs']);
  });

  it('returns an empty list for undefined or blank input', () => {
    expect(parseWordList(undefined)).toEqual([]);
    expect(parseWordList('')).toEqual([]);
    expect(parseWordList(' , \n ')).toEqual([]);
  });

  it('keeps multi-word phrases intact', () => {
    expect(parseWordList('school board, city council')).toEqual(['school board', 'city council']);
  });
});

describe('mergeFeeds', () => {
  it('merges every ok feed, sorts newest first, and tags each story with its feed', () => {
    const a = feed('a', { label: 'Feed A' });
    const b = feed('b');
    const older = item({ timestamp: NOW - 5 * HOUR });
    const newer = item({ timestamp: NOW - 1 * HOUR });
    const middle = item({ timestamp: NOW - 3 * HOUR });

    const out = mergeFeeds([ok(a, [older, newer]), ok(b, [middle])], { maxItems: 10, now: NOW });

    expect(out.map((i) => i.id)).toEqual([newer.id, middle.id, older.id]);
    expect(out[0].feedId).toBe('a');
    expect(out[1].feedId).toBe('b');
    expect(out.every((i) => !('order' in i))).toBe(true);
  });

  it('sinks undated stories to the bottom in their original order', () => {
    const a = feed('a');
    const u1 = item({ timestamp: null });
    const dated = item({ timestamp: NOW - HOUR });
    const u2 = item({ timestamp: null });

    const out = mergeFeeds([ok(a, [u1, dated, u2])], { maxItems: 10, now: NOW });
    expect(out.map((i) => i.id)).toEqual([dated.id, u1.id, u2.id]);
  });

  it('keeps stories with equal timestamps in arrival order', () => {
    const a = feed('a');
    const b = feed('b');
    const t = NOW - HOUR;
    const first = item({ timestamp: t });
    const second = item({ timestamp: t });
    const out = mergeFeeds([ok(a, [first]), ok(b, [second])], { maxItems: 10, now: NOW });
    expect(out.map((i) => i.id)).toEqual([first.id, second.id]);
  });

  it('preserveOrder keeps feed order and skips the sort', () => {
    const a = feed('a');
    const b = feed('b');
    const oldA = item({ timestamp: NOW - 9 * HOUR });
    const newB = item({ timestamp: NOW - HOUR });
    const undatedA = item({ timestamp: null });

    const out = mergeFeeds([ok(a, [oldA, undatedA]), ok(b, [newB])], { maxItems: 10, preserveOrder: true, now: NOW });
    expect(out.map((i) => i.id)).toEqual([oldA.id, undatedA.id, newB.id]);
  });

  describe('dedupe across feeds', () => {
    it('by id', () => {
      const a = feed('a');
      const b = feed('b');
      const shared = item({ id: 'same-guid' });
      const dup = item({ id: 'same-guid', title: 'Different headline', link: 'https://other.example/x' });
      const out = mergeFeeds([ok(a, [shared]), ok(b, [dup])], { maxItems: 10, now: NOW });
      expect(out).toHaveLength(1);
      expect(out[0].feedId).toBe('a');
    });

    it('by link', () => {
      const a = feed('a');
      const b = feed('b');
      const first = item({ link: 'https://example.com/shared' });
      const dup = item({ link: 'https://example.com/shared', title: 'Other title' });
      const out = mergeFeeds([ok(a, [first]), ok(b, [dup])], { maxItems: 10, now: NOW });
      expect(out.map((i) => i.id)).toEqual([first.id]);
    });

    it('by normalized title (case and punctuation insensitive)', () => {
      const a = feed('a');
      const b = feed('b');
      const first = item({ title: 'Council approves new park!' });
      const dup = item({ title: 'council APPROVES   new park' });
      const out = mergeFeeds([ok(a, [first]), ok(b, [dup])], { maxItems: 10, now: NOW });
      expect(out.map((i) => i.id)).toEqual([first.id]);
    });

    it('does not treat two untitled, unlinked stories as duplicates of each other', () => {
      const a = feed('a');
      const x = item({ title: '', link: null, description: 'one' });
      const y = item({ title: '', link: null, description: 'two' });
      const out = mergeFeeds([ok(a, [x, y])], { maxItems: 10, now: NOW });
      expect(out).toHaveLength(2);
    });
  });

  describe('maxAgeHours', () => {
    it('drops stories older than the window but keeps undated ones', () => {
      const a = feed('a');
      const fresh = item({ timestamp: NOW - 2 * HOUR });
      const stale = item({ timestamp: NOW - 30 * HOUR });
      const undated = item({ timestamp: null });
      const out = mergeFeeds([ok(a, [fresh, stale, undated])], { maxItems: 10, maxAgeHours: 24, now: NOW });
      expect(out.map((i) => i.id)).toEqual([fresh.id, undated.id]);
    });

    it('0 or unset means no age limit', () => {
      const a = feed('a');
      const ancient = item({ timestamp: NOW - 1000 * HOUR });
      expect(mergeFeeds([ok(a, [ancient])], { maxItems: 10, maxAgeHours: 0, now: NOW })).toHaveLength(1);
      expect(mergeFeeds([ok(a, [ancient])], { maxItems: 10, now: NOW })).toHaveLength(1);
    });
  });

  describe('word filters', () => {
    it('blockedWords hides stories mentioning any word in title or description, case-insensitively', () => {
      const a = feed('a');
      const inTitle = item({ title: 'Massive LAYOFFS announced' });
      const inBody = item({ title: 'Quiet day', description: 'Talks of war continue' });
      const clean = item({ title: 'Kittens rescued', description: 'All well' });
      const out = mergeFeeds([ok(a, [inTitle, inBody, clean])], { maxItems: 10, blockedWords: 'layoffs, War', now: NOW });
      expect(out.map((i) => i.id)).toEqual([clean.id]);
    });

    it('blocked words match as substrings', () => {
      const a = feed('a');
      const s = item({ title: 'Shootings reported' });
      expect(mergeFeeds([ok(a, [s])], { maxItems: 10, blockedWords: 'shooting', now: NOW })).toHaveLength(0);
    });

    it('requiredWords keeps only stories mentioning at least one word', () => {
      const a = feed('a');
      const match = item({ title: 'School board meets tonight' });
      const bodyMatch = item({ title: 'Agenda', description: 'The City Council votes' });
      const miss = item({ title: 'Weather warms up' });
      const out = mergeFeeds([ok(a, [match, bodyMatch, miss])], { maxItems: 10, requiredWords: 'school board\ncity council', now: NOW });
      expect(out.map((i) => i.id)).toEqual([match.id, bodyMatch.id]);
    });

    it('blocked words win over required words', () => {
      const a = feed('a');
      const s = item({ title: 'School board war of words' });
      expect(mergeFeeds([ok(a, [s])], { maxItems: 10, requiredWords: 'school', blockedWords: 'war', now: NOW })).toHaveLength(0);
    });
  });

  describe('caps', () => {
    it('applies the per-feed maxItems before merging', () => {
      const a = feed('a', { maxItems: 2 });
      const b = feed('b');
      const a1 = item({ timestamp: NOW - 1 * HOUR });
      const a2 = item({ timestamp: NOW - 2 * HOUR });
      const a3 = item({ timestamp: NOW - 3 * HOUR });
      const b1 = item({ timestamp: NOW - 4 * HOUR });
      const out = mergeFeeds([ok(a, [a1, a2, a3]), ok(b, [b1])], { maxItems: 10, now: NOW });
      expect(out.map((i) => i.id)).toEqual([a1.id, a2.id, b1.id]);
    });

    it('per-feed cap counts only stories that survived the filters', () => {
      const a = feed('a', { maxItems: 1 });
      const blocked = item({ title: 'war' });
      const kept = item({ title: 'peace' });
      const out = mergeFeeds([ok(a, [blocked, kept])], { maxItems: 10, blockedWords: 'war', now: NOW });
      expect(out.map((i) => i.id)).toEqual([kept.id]);
    });

    it('a per-feed maxItems of 0 or unset means uncapped', () => {
      const a = feed('a', { maxItems: 0 });
      const items = [item(), item(), item()];
      expect(mergeFeeds([ok(a, items)], { maxItems: 10, now: NOW })).toHaveLength(3);
    });

    it('applies the total cap after sorting, with a minimum of 1', () => {
      const a = feed('a');
      const older = item({ timestamp: NOW - 3 * HOUR });
      const newest = item({ timestamp: NOW - 1 * HOUR });
      const middle = item({ timestamp: NOW - 2 * HOUR });
      const items = [older, newest, middle];
      expect(mergeFeeds([ok(a, items)], { maxItems: 2, now: NOW }).map((i) => i.id)).toEqual([newest.id, middle.id]);
      expect(mergeFeeds([ok(a, items)], { maxItems: 0, now: NOW })).toHaveLength(1);
      expect(mergeFeeds([ok(a, items)], { maxItems: -5, now: NOW })).toHaveLength(1);
      expect(mergeFeeds([ok(a, items)], { maxItems: Number.NaN, now: NOW })).toHaveLength(1);
      expect(mergeFeeds([ok(a, items)], { maxItems: 2.9, now: NOW })).toHaveLength(2);
    });
  });

  describe('source name and colour', () => {
    it('prefers the story publisher, then the feed label, then the feed title', () => {
      const labelled = feed('l', { label: '  Label  ' });
      const bare = feed('b');
      const withPublisher = item({ publisher: 'Prior Lake American' });
      const noPublisher = item();
      const fromTitle = item();

      const out = mergeFeeds(
        [ok(labelled, [withPublisher, noPublisher]), ok(bare, [fromTitle], 'Bare Feed Title')],
        { maxItems: 10, preserveOrder: true, now: NOW },
      );
      expect(out.map((i) => i.source)).toEqual(['Prior Lake American', 'Label', 'Bare Feed Title']);
    });

    it('carries the feed colour, leaving it undefined when unset or empty', () => {
      const coloured = feed('c', { color: '#ff0000' });
      const plain = feed('p', { color: '' });
      const out = mergeFeeds([ok(coloured, [item()]), ok(plain, [item()])], { maxItems: 10, preserveOrder: true, now: NOW });
      expect(out[0].sourceColor).toBe('#ff0000');
      expect(out[1].sourceColor).toBeUndefined();
    });
  });

  it('skips feeds that failed or have no result yet', () => {
    const good = feed('good');
    const bad = feed('bad');
    const pending = feed('pending');
    const kept = item();
    const out = mergeFeeds(
      [failed(bad), ok(good, [kept]), { feed: pending, result: undefined }],
      { maxItems: 10, now: NOW },
    );
    expect(out.map((i) => i.id)).toEqual([kept.id]);
  });

  it('returns an empty list when nothing is available', () => {
    expect(mergeFeeds([], { maxItems: 10 })).toEqual([]);
    expect(mergeFeeds([failed(feed('x'))], { maxItems: 10 })).toEqual([]);
  });
});

describe('failedFeeds', () => {
  it('returns only feeds whose result answered with an error', () => {
    const good = feed('good');
    const bad = feed('bad');
    const pending = feed('pending');
    const out = failedFeeds([ok(good, []), failed(bad), { feed: pending, result: undefined }]);
    expect(out.map((f) => f.feed.id)).toEqual(['bad']);
    expect(out[0].result?.error).toBe('http-error');
  });
});

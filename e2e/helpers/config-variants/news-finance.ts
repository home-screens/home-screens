import { expect, type Locator } from '@playwright/test';
import type { ConfigVariant } from './types';
import { has, lacks, matches, count, child, redBackground, redStyle, STANDINGS_8, TINY_GIF } from './shared';

/** Phase-1 batch rows — see .claude/plans/2026-07-09-e2e-100-percent-coverage.md. */

// --- Shared assertion + fixture helpers for this batch ---------------------

/**
 * The ticker views (news/stock-ticker/crypto/sports) all render through
 * TickerMarquee, which sets `animationDuration = max(1, itemCount) * speed`
 * seconds as an inline style on the `.animate-ticker-scroll` element. A
 * non-default `tickerSpeed` therefore produces a deterministic computed
 * animation-duration the harness can read back exactly.
 */
const tickerDuration = (seconds: string) => async (mod: Locator): Promise<void> => {
  const dur = await mod
    .locator('.animate-ticker-scroll')
    .first()
    .evaluate((el) => getComputedStyle(el).animationDuration);
  expect(dur).toBe(seconds);
};

const BBC = 'https://feeds.bbci.co.uk/news/rss.xml';
const DAY_MS = 86_400_000;
/** Far-future timestamps keep "newest first" deterministic without ever counting as "just in". */
const FUTURE = 4_055_000_000_000;

interface StubItem { id: string; title: string; description?: string; timestamp?: number | null; imageUrl?: string | null; link?: string | null }

/** `/api/news` answer for the default BBC feed with the given stories. */
const newsStub = (items: StubItem[], url = BBC) => ({
  feeds: [{
    url, ok: true, title: 'BBC News', format: 'rss', fetchedAt: FUTURE,
    items: items.map((i, n) => ({
      id: i.id, title: i.title, link: i.link ?? `https://example.com/${i.id}`,
      description: i.description ?? '', timestamp: i.timestamp === undefined ? FUTURE - n * 3_600_000 : i.timestamp,
      imageUrl: i.imageUrl ?? null,
    })),
  }],
});

/** Two headline items so the headline view has a second title to rotate to. */
const NEWS_2_HEADLINES = newsStub([
  { id: 'alpha', title: 'HEADLINE ALPHA' },
  { id: 'bravo', title: 'HEADLINE BRAVO' },
]);

/** One item published two days ago so the relative timestamp reads "2d ago". */
const NEWS_TIMESTAMPED = newsStub([{ id: 'ts', title: 'E2E NEWS ITEM', timestamp: Date.now() - 2 * DAY_MS - 60_000 }]);

/** An old story and a recent one, oldest FIRST in feed order. */
const NEWS_OLD_AND_RECENT = newsStub([
  { id: 'old', title: 'E2E OLD STORY', timestamp: Date.parse('2020-01-01T00:00:00Z') },
  { id: 'recent', title: 'E2E RECENT STORY', timestamp: Date.now() - 5 * 60_000 },
]);

/** One story carrying a picture the harness can load offline. */
const NEWS_WITH_IMAGE = newsStub([{ id: 'img', title: 'E2E PICTURE STORY', imageUrl: TINY_GIF }]);

/** Twelve long stories: more than the default 500x400 tile can show at once. */
const NEWS_MANY = newsStub(Array.from({ length: 12 }, (_, i) => ({
  id: `many-${i}`, title: `E2E STORY ${i + 1} with a headline long enough to wrap onto a second line`, description: 'A summary line under the headline.',
})));

/** The story tapped in the tap-action rows; the overlay must show its summary. */
const NEWS_TAPPABLE = newsStub([{ id: 'tap', title: 'E2E TAP STORY', description: 'E2E TAP SUMMARY' }]);

/** Click the first story and expect the given overlay flavour. */
const tapOpens = (mode: 'qr' | 'details') => async (mod: Locator): Promise<void> => {
  await mod.locator('button[data-news-story]').first().click();
  await expect(mod.locator(`[data-news-overlay="${mode}"]`)).toBeVisible();
};

/** The cards grid resolves to exactly `n` column tracks. */
const cardColumns = (n: number) => async (mod: Locator): Promise<void> => {
  const tracks = await mod.locator('[data-news-cards]').first()
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
  expect(tracks).toBe(n);
};

/** Two NFL divisions so the table view has a second group to rotate to. */
const STANDINGS_2_GROUPS = {
  groups: ['GROUP ALPHA', 'GROUP BRAVO'].map((name) => ({
    name,
    league: 'NFL',
    entries: [{
      rank: 1, team: 'Team A', teamAbbr: 'TA', teamShort: 'TeamA', teamLogo: '', teamColor: '888888',
      wins: 5, losses: 1, winPct: 0.833, streak: 'W1', pointsFor: 200, pointsAgainst: 150, differential: 50,
    }],
  })),
};

/**
 * Week-flavored stub: both stocks up today, both down over the week, so the
 * week-only variant flips both charts from green to red.
 */
const STOCKS_WEEK_RED = {
  stocks: [
    {
      symbol: 'AAPL', price: 150.25, change: 1.23, changePercent: 0.55,
      sparkline: [149.1, 149.6, 150.25], sparklineXs: [0, 0.5, 1],
      sparklineWeek: [152.0, 151.4, 150.25], weekChangePercent: -1.15, weekLastDayStart: 0.6667,
    },
    {
      symbol: 'MSFT', price: 402.1, change: 1.1, changePercent: 0.27,
      sparkline: [401.0, 401.5, 402.1], sparklineXs: [0, 0.5, 1],
      sparklineWeek: [405.0, 403.8, 402.1], weekChangePercent: -0.72, weekLastDayStart: 0.6667,
    },
  ],
};

// --- The matrix ------------------------------------------------------------

export const NEWS_FINANCE_VARIANTS: ConfigVariant[] = [
  // -- news --
  {
    // A story two days old → formatNewsAge renders the "2d ago" relative label.
    type: 'news', name: 'show-timestamp', kind: 'networked', stubKey: 'news', stubBody: NEWS_TIMESTAMPED,
    config: { view: 'list', showTimestamp: true },
    expect: async (mod) => { await has('E2E NEWS ITEM')(mod); await matches(/2d ago/)(mod); },
  },
  {
    // accentColor tints the list bullet's background (default is translucent white).
    type: 'news', name: 'accent-color', kind: 'networked', stubKey: 'news',
    config: { view: 'list', accentColor: '#ff0000', showImages: false },
    expect: redStyle('[class*="w-1.5"]', 'background-color'),
  },
  {
    // 2 items × 20s = 40s marquee duration (default tickerSpeed 5 → 10s).
    type: 'news', name: 'ticker-speed', kind: 'networked', stubKey: 'news',
    config: { view: 'ticker', tickerSpeed: 20 },
    expect: tickerDuration('40s'),
  },
  {
    // Headline view rotates through items; assert the second headline lands.
    type: 'news', name: 'rotate-interval', kind: 'networked', stubKey: 'news', stubBody: NEWS_2_HEADLINES,
    config: { view: 'headline', rotateIntervalMs: 400 },
    expect: has('HEADLINE BRAVO'),
  },
  {
    // A feed's own label is what the story shows as its source.
    type: 'news', name: 'feed-label', kind: 'networked', stubKey: 'news',
    config: { view: 'compact', showSource: true, feeds: [{ id: 'f1', url: BBC, label: 'E2E SOURCE' }] },
    expect: has('E2E SOURCE'),
  },
  {
    // A feed colour paints the list bullet (falls back to accentColor / white otherwise).
    type: 'news', name: 'feed-color', kind: 'networked', stubKey: 'news',
    config: { view: 'list', showImages: false, feeds: [{ id: 'f1', url: BBC, color: '#ff0000' }] },
    expect: redStyle('[class*="w-1.5"]', 'background-color'),
  },
  {
    // Per-feed cap applies before merging: only the newest of the two stories survives.
    type: 'news', name: 'feed-max-items', kind: 'networked', stubKey: 'news',
    config: { view: 'list', feeds: [{ id: 'f1', url: BBC, maxItems: 1 }] },
    expect: lacks('Global markets rally on tech surge', 'City council approves new park'),
  },
  {
    // maxAgeHours hides the 2020 story and keeps the one from five minutes ago.
    type: 'news', name: 'max-age', kind: 'networked', stubKey: 'news', stubBody: NEWS_OLD_AND_RECENT,
    config: { view: 'list', maxAgeHours: 24 },
    expect: lacks('E2E RECENT STORY', 'E2E OLD STORY'),
  },
  {
    // A blocked word (case-insensitive substring) hides the council story.
    type: 'news', name: 'blocked-words', kind: 'networked', stubKey: 'news',
    config: { view: 'list', blockedWords: 'COUNCIL, war' },
    expect: lacks('Global markets rally on tech surge', 'City council approves new park'),
  },
  {
    // A required word keeps only the story that mentions it (summary counts too).
    type: 'news', name: 'required-words', kind: 'networked', stubKey: 'news',
    config: { view: 'list', requiredWords: 'green space' },
    expect: lacks('City council approves new park', 'Global markets rally on tech surge'),
  },
  {
    // Default sorts newest first (RECENT before OLD); preserveOrder keeps the feed's OLD-first order.
    type: 'news', name: 'preserve-order', kind: 'networked', stubKey: 'news', stubBody: NEWS_OLD_AND_RECENT,
    config: { view: 'compact', preserveOrder: true },
    expect: matches(/E2E OLD STORY[\s\S]*E2E RECENT STORY/),
  },
  {
    // Overflowing rows are paged (whole rows only), never clipped: the list
    // reports more than one page and the header counter shows it.
    type: 'news', name: 'list-paging', kind: 'networked', stubKey: 'news', stubBody: NEWS_MANY,
    config: { view: 'list', maxItems: 12, showDescription: true, rotateIntervalMs: 60_000 },
    expect: async (mod) => {
      await has('E2E STORY 1')(mod);
      await expect.poll(async () => Number(await mod.locator('[data-news-pages]').getAttribute('data-news-pages'))).toBeGreaterThan(1);
      await expect(mod.locator('[data-news-counter]')).toHaveText(/1 of \d+/);
    },
  },
  {
    type: 'news', name: 'tap-qr', kind: 'networked', stubKey: 'news', stubBody: NEWS_TAPPABLE,
    config: { view: 'list', tapAction: 'qr' },
    expect: tapOpens('qr'),
  },
  {
    type: 'news', name: 'tap-details', kind: 'networked', stubKey: 'news', stubBody: NEWS_TAPPABLE,
    config: { view: 'list', tapAction: 'details' },
    expect: async (mod) => { await tapOpens('details')(mod); await has('E2E TAP SUMMARY')(mod); },
  },
  {
    // With taps off, stories are plain rows, not buttons.
    type: 'news', name: 'tap-none', kind: 'networked', stubKey: 'news', stubBody: NEWS_TAPPABLE,
    config: { view: 'list', tapAction: 'none' },
    expect: async (mod) => { await has('E2E TAP STORY')(mod); await count('button[data-news-story]', 0)(mod); },
  },
  {
    type: 'news', name: 'header-title', kind: 'networked', stubKey: 'news',
    config: { view: 'list', title: 'E2E HEADER' },
    expect: has('E2E HEADER'),
  },
  {
    type: 'news', name: 'header-off', kind: 'networked', stubKey: 'news',
    config: { view: 'list', title: 'E2E HEADER', showHeader: false },
    expect: lacks('Global markets rally on tech surge', 'E2E HEADER'),
  },
  {
    // Compact shows the feed title as the source by default; showSource hides it.
    type: 'news', name: 'source-off', kind: 'networked', stubKey: 'news',
    config: { view: 'compact', showSource: false },
    expect: lacks('Global markets rally on tech surge', 'BBC News'),
  },
  {
    type: 'news', name: 'images-on', kind: 'networked', stubKey: 'news', stubBody: NEWS_WITH_IMAGE,
    config: { view: 'list', showImages: true },
    expect: child('[data-news-thumb="image"]'),
  },
  {
    type: 'news', name: 'images-off', kind: 'networked', stubKey: 'news', stubBody: NEWS_WITH_IMAGE,
    config: { view: 'list', showImages: false },
    expect: async (mod) => { await has('E2E PICTURE STORY')(mod); await count('[data-news-thumb]', 0)(mod); },
  },
  {
    // descriptionLines drives the inline -webkit-line-clamp on the summary.
    type: 'news', name: 'description-lines', kind: 'networked', stubKey: 'news',
    config: { view: 'list', showDescription: true, descriptionLines: 4 },
    expect: child('[style*="line-clamp: 4"]'),
  },
  {
    type: 'news', name: 'single-line-titles', kind: 'networked', stubKey: 'news',
    config: { view: 'list', singleLineTitles: true },
    expect: child('[style*="line-clamp: 1"]'),
  },
  {
    type: 'news', name: 'counter-on', kind: 'networked', stubKey: 'news',
    config: { view: 'headline', showCounter: true, rotateIntervalMs: 60_000 },
    expect: has('1 of 2'),
  },
  {
    type: 'news', name: 'counter-off', kind: 'networked', stubKey: 'news',
    config: { view: 'headline', showCounter: false },
    expect: async (mod) => { await has('Global markets rally on tech surge')(mod); await count('[data-news-counter]', 0)(mod); },
  },
  {
    // The five-minute-old story gets the "Just in" pill.
    type: 'news', name: 'highlight-breaking', kind: 'networked', stubKey: 'news', stubBody: NEWS_OLD_AND_RECENT,
    config: { view: 'compact', highlightBreaking: true },
    expect: child('[data-news-breaking]'),
  },
  {
    type: 'news', name: 'cards-columns-3', kind: 'networked', stubKey: 'news',
    config: { view: 'cards', cardColumns: 3 },
    expect: cardColumns(3),
  },
  {
    type: 'news', name: 'cards-columns-1', kind: 'networked', stubKey: 'news',
    config: { view: 'cards', cardColumns: 1 },
    expect: cardColumns(1),
  },
  {
    type: 'news', name: 'ticker-separator-dot', kind: 'networked', stubKey: 'news',
    config: { view: 'ticker', tickerSeparator: 'dot' },
    expect: has('•'),
  },
  {
    type: 'news', name: 'ticker-separator-pipe', kind: 'networked', stubKey: 'news',
    config: { view: 'ticker', tickerSeparator: 'pipe' },
    expect: has('|'),
  },
  {
    type: 'news', name: 'ticker-separator-slash', kind: 'networked', stubKey: 'news',
    config: { view: 'ticker', tickerSeparator: 'slash' },
    expect: has('/'),
  },

  // -- fullscreen-news --
  // Shares the feed pipeline (merge, filters, tap overlay) with the news tile;
  // rows below pin the canvas-only toggles plus the shared tap-action members.
  {
    type: 'fullscreen-news', name: 'story-description', kind: 'networked', stubKey: 'news',
    config: { view: 'story', showDescription: true },
    expect: async (mod) => { await has('Stocks climbed today.')(mod); await child('[data-news-description]')(mod); },
  },
  {
    type: 'fullscreen-news', name: 'story-no-description', kind: 'networked', stubKey: 'news',
    config: { view: 'story', showDescription: false },
    expect: async (mod) => { await has('Global markets rally on tech surge')(mod); await count('[data-news-description]', 0)(mod); },
  },
  {
    type: 'fullscreen-news', name: 'source-off', kind: 'networked', stubKey: 'news',
    config: { view: 'story', showSource: false },
    expect: async (mod) => { await has('Global markets rally on tech surge')(mod); await count('[data-news-source]', 0)(mod); },
  },
  {
    type: 'fullscreen-news', name: 'feed-label', kind: 'networked', stubKey: 'news',
    config: { view: 'story', showSource: true, feeds: [{ id: 'f1', url: BBC, label: 'E2E SOURCE' }] },
    expect: has('E2E SOURCE'),
  },
  {
    type: 'fullscreen-news', name: 'timestamp-on', kind: 'networked', stubKey: 'news', stubBody: NEWS_TIMESTAMPED,
    config: { view: 'story', showTimestamp: true },
    expect: matches(/2d ago/),
  },
  {
    type: 'fullscreen-news', name: 'timestamp-off', kind: 'networked', stubKey: 'news', stubBody: NEWS_TIMESTAMPED,
    config: { view: 'story', showTimestamp: false },
    expect: async (mod) => { await has('E2E NEWS ITEM')(mod); await count('[data-news-age]', 0)(mod); },
  },
  {
    type: 'fullscreen-news', name: 'images-on', kind: 'networked', stubKey: 'news', stubBody: NEWS_WITH_IMAGE,
    config: { view: 'story', showImages: true },
    expect: child('[data-news-hero="image"]'),
  },
  {
    type: 'fullscreen-news', name: 'images-off', kind: 'networked', stubKey: 'news', stubBody: NEWS_WITH_IMAGE,
    config: { view: 'story', showImages: false },
    expect: child('[data-news-hero="placeholder"]'),
  },
  {
    type: 'fullscreen-news', name: 'clock-on', kind: 'networked', stubKey: 'news',
    config: { view: 'story', showTime: true },
    expect: child('[data-news-clock]'),
  },
  {
    type: 'fullscreen-news', name: 'clock-off', kind: 'networked', stubKey: 'news',
    config: { view: 'story', showTime: false },
    expect: async (mod) => { await has('Global markets rally on tech surge')(mod); await count('[data-news-clock]', 0)(mod); },
  },
  {
    // The filled progress segment takes the accent colour.
    type: 'fullscreen-news', name: 'accent-color', kind: 'networked', stubKey: 'news',
    config: { view: 'story', accentColor: '#ff0000' },
    expect: redStyle('[data-news-progress] span', 'background-color'),
  },
  {
    // Front page with one story shows the lead only and no grid.
    type: 'fullscreen-news', name: 'front-page-max-items', kind: 'networked', stubKey: 'news',
    config: { view: 'front-page', maxItems: 1 },
    expect: async (mod) => { await lacks('Global markets rally on tech surge', 'City council approves new park')(mod); await count('[data-news-grid]', 0)(mod); },
  },
  {
    type: 'fullscreen-news', name: 'front-page-grid', kind: 'networked', stubKey: 'news',
    config: { view: 'front-page', maxItems: 12 },
    expect: async (mod) => { await has('City council approves new park')(mod); await child('[data-news-grid]')(mod); },
  },
  {
    type: 'fullscreen-news', name: 'blocked-words', kind: 'networked', stubKey: 'news',
    config: { view: 'front-page', blockedWords: 'council' },
    expect: lacks('Global markets rally on tech surge', 'City council approves new park'),
  },
  {
    type: 'fullscreen-news', name: 'required-words', kind: 'networked', stubKey: 'news',
    config: { view: 'front-page', requiredWords: 'green space' },
    expect: lacks('City council approves new park', 'Global markets rally on tech surge'),
  },
  {
    type: 'fullscreen-news', name: 'max-age', kind: 'networked', stubKey: 'news', stubBody: NEWS_OLD_AND_RECENT,
    config: { view: 'front-page', maxAgeHours: 24 },
    expect: lacks('E2E RECENT STORY', 'E2E OLD STORY'),
  },
  {
    // Story view shows the FIRST story: newest by default, the feed's first (OLD) with preserveOrder.
    type: 'fullscreen-news', name: 'preserve-order', kind: 'networked', stubKey: 'news', stubBody: NEWS_OLD_AND_RECENT,
    config: { view: 'story', preserveOrder: true, rotateIntervalMs: 60_000 },
    expect: lacks('E2E OLD STORY', 'E2E RECENT STORY'),
  },
  {
    type: 'fullscreen-news', name: 'tap-qr', kind: 'networked', stubKey: 'news', stubBody: NEWS_TAPPABLE,
    config: { view: 'story', tapAction: 'qr' },
    expect: tapOpens('qr'),
  },
  {
    type: 'fullscreen-news', name: 'tap-details', kind: 'networked', stubKey: 'news', stubBody: NEWS_TAPPABLE,
    config: { view: 'front-page', tapAction: 'details' },
    expect: async (mod) => { await tapOpens('details')(mod); await has('E2E TAP SUMMARY')(mod); },
  },
  {
    type: 'fullscreen-news', name: 'tap-none', kind: 'networked', stubKey: 'news', stubBody: NEWS_TAPPABLE,
    config: { view: 'story', tapAction: 'none' },
    expect: async (mod) => { await has('E2E TAP STORY')(mod); await count('button[data-news-story]', 0)(mod); },
  },

  // -- stock-ticker --
  {
    // 2 stocks × 20s = 40s marquee duration.
    type: 'stock-ticker', name: 'ticker-speed', kind: 'networked', stubKey: 'stocks',
    config: { view: 'ticker', tickerSpeed: 20 },
    expect: tickerDuration('40s'),
  },
  {
    // showSparkline:false removes the trend-line SVGs the default cards render
    // includes (presence is asserted by the stock-ticker module fixture).
    type: 'stock-ticker', name: 'hide-sparkline', kind: 'networked', stubKey: 'stocks',
    config: { view: 'cards', showSparkline: false },
    expect: async (mod) => { await has('AAPL')(mod); await count('.financial-sparkline', 0)(mod); },
  },
  {
    // Shaded theme adds the backdrop rect under each sparkline.
    type: 'stock-ticker', name: 'sparkline-theme', kind: 'networked', stubKey: 'stocks',
    config: { view: 'cards', sparklineTheme: 'shaded' },
    expect: count('.financial-sparkline rect', 2),
  },
  {
    // Week-only charts colored by the week's move (both red in this stub,
    // while their day changes are positive). Shaded is required — classic
    // keeps the day color for every chart. Count 2 (not 4) pins week-only.
    type: 'stock-ticker', name: 'sparkline-mode-week', kind: 'networked', stubKey: 'stocks',
    stubBody: STOCKS_WEEK_RED,
    config: { view: 'cards', sparklineTheme: 'shaded', sparklineMode: 'week' },
    expect: async (mod) => {
      await count('.financial-sparkline', 2)(mod);
      await count('.financial-sparkline.text-red-400', 2)(mod);
    },
  },
  {
    // Both mode doubles the charts: 2 stocks x (day + week).
    type: 'stock-ticker', name: 'sparkline-mode-both', kind: 'networked', stubKey: 'stocks',
    config: { view: 'cards', sparklineTheme: 'shaded', sparklineMode: 'both' },
    expect: count('.financial-sparkline', 4),
  },
  {
    // Labels caption every chart (2 stocks x day + week = 4 captions); the
    // default (off) renders none, which the both-mode row above pins by
    // asserting only the SVGs.
    type: 'stock-ticker', name: 'sparkline-labels', kind: 'networked', stubKey: 'stocks',
    config: { view: 'cards', sparklineTheme: 'shaded', sparklineMode: 'both', sparklineLabels: true },
    expect: async (mod) => {
      await count('.financial-sparkline-label', 4)(mod);
      await has('1D')(mod);
      await has('5D')(mod);
    },
  },

  // -- crypto --
  {
    // 2 coins × 20s = 40s marquee duration.
    type: 'crypto', name: 'ticker-speed', kind: 'networked', stubKey: 'crypto',
    config: { view: 'ticker', tickerSpeed: 20 },
    expect: tickerDuration('40s'),
  },
  {
    // showSparkline:false removes the trend-line SVGs the default cards render
    // includes (presence is asserted by the crypto module fixture).
    type: 'crypto', name: 'hide-sparkline', kind: 'networked', stubKey: 'crypto',
    config: { view: 'cards', showSparkline: false },
    expect: async (mod) => { await has('Bitcoin')(mod); await count('.financial-sparkline', 0)(mod); },
  },

  // -- sports --
  {
    // 1 game × 20s = 20s marquee duration (default tickerSpeed 4 → 4s).
    type: 'sports', name: 'ticker-speed', kind: 'networked', stubKey: 'sports',
    config: { view: 'ticker', tickerSpeed: 20 },
    expect: tickerDuration('20s'),
  },

  // -- standings --
  {
    // 8 teams capped to 3 → ranks 1-3 render, rank 4 is dropped.
    type: 'standings', name: 'teams-to-show', kind: 'networked', stubKey: 'standings', stubBody: STANDINGS_8,
    config: { view: 'table', league: 'nfl', grouping: 'division', teamsToShow: 3 },
    expect: lacks('Team3', 'Team4'),
  },
  {
    // Two groups rotate in the table view; assert the second group's header lands.
    type: 'standings', name: 'rotation-interval', kind: 'networked', stubKey: 'standings', stubBody: STANDINGS_2_GROUPS,
    config: { view: 'table', league: 'nfl', grouping: 'division', rotationIntervalMs: 400 },
    expect: has('GROUP BRAVO'),
  },
  {
    // grouping='league' doubles the NFL playoff count (7→14). With only 8 teams no
    // rank hits the cutoff, so the playoff divider that the division row asserts
    // (core.ts standings·playoff-line, same 8-team fixture) is absent here.
    type: 'standings', name: 'grouping-league', kind: 'networked', stubKey: 'standings', stubBody: STANDINGS_8,
    config: { view: 'table', league: 'nfl', grouping: 'league', showPlayoffLine: true },
    expect: async (mod) => { await has('Team1')(mod); await count('.border-dashed', 0)(mod); },
  },

  // -- dad-joke --
  {
    // showDividers:false removes both AccentDivider bars (the .w-12 rounded pills).
    type: 'dad-joke', name: 'hide-dividers', kind: 'networked', stubKey: 'dad-joke',
    config: { showDividers: false },
    expect: async (mod) => { await has('skeletons')(mod); await count('.w-12.rounded-full', 0)(mod); },
  },

  // -- word-of-day --
  {
    // accentColor tints the AccentDivider pills (network-free: word list is bundled).
    type: 'word-of-day', name: 'accent-color', kind: 'network-free',
    config: { accentColor: '#ff0000' },
    expect: redBackground('.w-12.rounded-full'),
  },

  // -- history --
  {
    // accentColor tints the AccentDivider pill.
    type: 'history', name: 'accent-color', kind: 'networked', stubKey: 'history',
    config: { accentColor: '#ff0000' },
    expect: async (mod) => { await has('Apollo 11')(mod); await redBackground('.w-12.rounded-full')(mod); },
  },
];

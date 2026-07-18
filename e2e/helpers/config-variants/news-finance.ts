import { expect, type Locator } from '@playwright/test';
import type { ConfigVariant } from './types';
import { has, lacks, matches, count, redBackground, redStyle, STANDINGS_8 } from './shared';

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

/** Two headline items so the headline view has a second title to rotate to. */
const NEWS_2_HEADLINES = {
  items: [
    { title: 'HEADLINE ALPHA', pubDate: '', description: '' },
    { title: 'HEADLINE BRAVO', pubDate: '', description: '' },
  ],
};

/** One list item with a fixed past pubDate so the relative timestamp is stable. */
const NEWS_TIMESTAMPED = {
  items: [{ title: 'E2E NEWS ITEM', pubDate: '2020-01-01T00:00:00Z', description: '' }],
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

// --- The matrix ------------------------------------------------------------

export const NEWS_FINANCE_VARIANTS: ConfigVariant[] = [
  // -- news --
  {
    // pubDate a fixed past date → formatTime renders the "{n}d ago" relative label.
    type: 'news', name: 'show-timestamp', kind: 'networked', stubKey: 'news', stubBody: NEWS_TIMESTAMPED,
    config: { view: 'list', showTimestamp: true },
    expect: async (mod) => { await has('E2E NEWS ITEM')(mod); await matches(/\d+d ago/)(mod); },
  },
  {
    // accentColor tints the list bullet's background (default is translucent white).
    type: 'news', name: 'accent-color', kind: 'networked', stubKey: 'news',
    config: { view: 'list', accentColor: '#ff0000' },
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

  // -- stock-ticker --
  {
    // 2 stocks × 20s = 40s marquee duration.
    type: 'stock-ticker', name: 'ticker-speed', kind: 'networked', stubKey: 'stocks',
    config: { view: 'ticker', tickerSpeed: 20 },
    expect: tickerDuration('40s'),
  },

  // -- crypto --
  {
    // 2 coins × 20s = 40s marquee duration.
    type: 'crypto', name: 'ticker-speed', kind: 'networked', stubKey: 'crypto',
    config: { view: 'ticker', tickerSpeed: 20 },
    expect: tickerDuration('40s'),
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

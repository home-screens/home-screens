// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type FullscreenNewsConfig, type ModuleStyle } from '@/types/config';
import type { NewsDisplayItem } from '@/lib/news/types';
import { newsItemKey, type NewsFeedsState } from '@/hooks/useNewsFeeds';
import { dispatchModuleCommand } from '@/hooks/useModuleCommand';
import { installResizeObserverStub, I18nWrapper as Wrapper } from '@/components/modules/__tests__/helpers/harness';
import { BurnInProtectionProvider } from '@/components/display/burn-in-context';
import { WANDER_REACH_X_PX, WANDER_REACH_Y_PX, pixelShiftMinute, wanderOffset } from '@/lib/pixel-shift';

installResizeObserverStub();

const NOW = new Date('2026-08-29T14:00:00Z').getTime();

function story(n: number, over: Partial<NewsDisplayItem> = {}): NewsDisplayItem {
  return {
    id: `s${n}`,
    feedId: 'f1',
    title: `Headline number ${n}`,
    link: `https://example.com/${n}`,
    description: `Summary for story ${n}`,
    timestamp: NOW - n * 3_600_000,
    imageUrl: null,
    source: 'Example News',
    sourceColor: '#3b82f6',
    ...over,
  };
}

let mockState: NewsFeedsState;
vi.mock('@/hooks/useNewsFeeds', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useNewsFeeds')>('@/hooks/useNewsFeeds');
  return { ...actual, useNewsFeeds: () => mockState };
});

import FullscreenNewsModule from '../FullscreenNewsModule';

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

function loaded(items: NewsDisplayItem[]): NewsFeedsState {
  return { items, data: { feeds: [] }, error: null, failed: [], allFailed: false, newKeys: new Set() };
}

function makeConfig(overrides: Partial<FullscreenNewsConfig> = {}): FullscreenNewsConfig {
  return {
    feeds: [{ id: 'f1', url: 'https://example.com/feed.xml', label: 'Example News' }],
    refreshIntervalMs: 300_000,
    view: 'story',
    rotateIntervalMs: 15_000,
    maxItems: 12,
    showDescription: true,
    showSource: true,
    showTimestamp: true,
    showImages: true,
    showTime: true,
    typographySize: 'medium',
    accentColor: '',
    tapAction: 'qr',
    ...overrides,
  };
}

function renderNews(config: FullscreenNewsConfig) {
  return render(
    <FullscreenNewsModule config={config} style={style} fullscreenTheme="midnight" timeFormat="12h" />,
    { wrapper: Wrapper },
  );
}

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
});

const THREE = [
  story(0, { timestamp: NOW - 10 * 60_000, imageUrl: 'https://example.com/a.jpg' }),
  story(1),
  story(2),
];

describe('FullscreenNewsModule story view', () => {
  it('renders one story at a time with source, age, progress and the clock', () => {
    mockState = loaded(THREE);
    const { container } = renderNews(makeConfig({ view: 'story' }));

    const root = container.querySelector('[data-fullscreen-news-view="story"]');
    expect(root).not.toBeNull();
    expect(container.querySelectorAll('[data-news-story]')).toHaveLength(1);
    expect(container.querySelector('[data-news-headline]')?.textContent).toBe('Headline number 0');
    expect(container.querySelector('[data-news-description]')?.textContent).toBe('Summary for story 0');
    expect(container.querySelector('[data-news-source]')?.textContent).toBe('Example News');
    expect(container.querySelector('[data-news-age]')?.textContent).toBe('10m ago');
    expect(container.querySelector('[data-news-breaking]')?.textContent).toBe('Just in');
    expect(container.querySelector('[data-news-hero]')?.getAttribute('data-news-hero')).toBe('image');
    expect(container.querySelector('[data-news-progress]')?.textContent).toContain('1 of 3');
    expect(container.querySelector('[data-news-clock]')).not.toBeNull();
  });

  it('advances on the rotation timer and on hub commands', () => {
    mockState = loaded(THREE);
    const { container } = renderNews(makeConfig({ view: 'story', rotateIntervalMs: 5_000 }));
    const headline = () => container.querySelector('[data-news-headline]')?.textContent;

    expect(headline()).toBe('Headline number 0');
    act(() => { vi.advanceTimersByTime(5_100); });
    expect(headline()).toBe('Headline number 1');
    // A story without a picture drops to the placeholder band.
    expect(container.querySelector('[data-news-hero]')?.getAttribute('data-news-hero')).toBe('placeholder');

    act(() => { dispatchModuleCommand({ module: 'fullscreen-news', action: 'next' }); });
    expect(headline()).toBe('Headline number 2');
    act(() => { dispatchModuleCommand({ module: 'fullscreen-news', action: 'prev' }); });
    expect(headline()).toBe('Headline number 1');
  });

  it('hides the optional parts when they are switched off', () => {
    mockState = loaded(THREE);
    const { container } = renderNews(makeConfig({
      view: 'story', showDescription: false, showSource: false, showTimestamp: false, showImages: false, showTime: false,
    }));
    expect(container.querySelector('[data-news-description]')).toBeNull();
    expect(container.querySelector('[data-news-source]')).toBeNull();
    expect(container.querySelector('[data-news-age]')).toBeNull();
    expect(container.querySelector('[data-news-clock]')).toBeNull();
    expect(container.querySelector('[data-news-hero]')?.getAttribute('data-news-hero')).toBe('placeholder');
  });

  it('opens the tap overlay and closes it on dismiss', () => {
    mockState = loaded(THREE);
    const { container } = renderNews(makeConfig({ view: 'story', tapAction: 'details' }));

    fireEvent.click(container.querySelector('[data-news-story]')!);
    expect(container.querySelector('[data-news-overlay="details"]')?.textContent).toContain('Summary for story 0');

    act(() => { dispatchModuleCommand({ module: 'fullscreen-news', action: 'dismiss' }); });
    expect(container.querySelector('[data-news-overlay]')).toBeNull();

    act(() => { dispatchModuleCommand({ module: 'fullscreen-news', action: 'details' }); });
    expect(container.querySelector('[data-news-overlay="details"]')).not.toBeNull();
  });

  it('renders plain rows, not buttons, when tapping does nothing', () => {
    mockState = loaded(THREE);
    const { container } = renderNews(makeConfig({ view: 'story', tapAction: 'none' }));
    expect(container.querySelector('button[data-news-story]')).toBeNull();
    expect(container.querySelector('[data-news-story]')).not.toBeNull();
  });

  it('drops the "Just in" pill, and the row it was holding open, when the switch is off', () => {
    mockState = loaded(THREE);
    const off = renderNews(makeConfig({ view: 'story', highlightBreaking: false }));
    expect(off.container.querySelector('[data-news-breaking]')).toBeNull();
    // Source and age are untouched.
    expect(off.container.querySelector('[data-news-source]')).not.toBeNull();
    expect(off.container.querySelector('[data-news-age]')?.textContent).toBe('10m ago');
    cleanup();

    const bare = renderNews(makeConfig({ view: 'story', highlightBreaking: false, showSource: false, showTimestamp: false }));
    const headline = bare.container.querySelector('[data-news-headline]')!;
    expect(headline.previousElementSibling).toBeNull();
    cleanup();

    // With the switch on, the pill alone keeps the row.
    const pillOnly = renderNews(makeConfig({ view: 'story', showSource: false, showTimestamp: false }));
    expect(pillOnly.container.querySelector('[data-news-headline]')!.previousElementSibling?.textContent).toBe('Just in');
  });

  it('dots a story that arrived since the last refresh, only when asked, and never beside the pill', () => {
    const fresh = new Set([THREE[0], THREE[1]].map(newsItemKey));
    mockState = { ...loaded(THREE), newKeys: fresh };
    const quiet = renderNews(makeConfig({ view: 'story' }));
    expect(quiet.container.querySelector('[data-news-new]')).toBeNull();
    cleanup();

    // Story 0 is ten minutes old: it gets the pill, which already says fresh.
    const { container } = renderNews(makeConfig({ view: 'story', showNewMarker: true, rotateIntervalMs: 5_000 }));
    expect(container.querySelector('[data-news-breaking]')).not.toBeNull();
    expect(container.querySelector('[data-news-new]')).toBeNull();
    // Story 1 is an hour old: no pill, so the dot.
    act(() => { vi.advanceTimersByTime(5_100); });
    expect(container.querySelector('[data-news-breaking]')).toBeNull();
    expect(container.querySelector('[data-news-new]')?.getAttribute('aria-label')).toBe('New story');
    // Story 2 was there all along.
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(container.querySelector('[data-news-new]')).toBeNull();
    cleanup();

    // With the pill switched off the dot stands in for it.
    const noPill = renderNews(makeConfig({ view: 'story', showNewMarker: true, highlightBreaking: false }));
    expect(noPill.container.querySelector('[data-news-new]')).not.toBeNull();
  });
});

describe('FullscreenNewsModule corner clock and burn-in protection', () => {
  const clock = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-news-clock]')!;
  const renderProtected = (protect: boolean) => render(
    <BurnInProtectionProvider value={protect}>
      <FullscreenNewsModule config={makeConfig({ view: 'story' })} style={style} fullscreenTheme="midnight" timeFormat="12h" />
    </BurnInProtectionProvider>,
    { wrapper: Wrapper },
  );

  it('holds still with no protection', () => {
    mockState = loaded(THREE);
    expect(clock(renderProtected(false).container).style.transform).toBe('');
  });

  it('drifts a pixel a minute with protection on, as the photo clock does', () => {
    mockState = loaded(THREE);
    const { container } = renderProtected(true);
    act(() => { vi.advanceTimersByTime(0); });
    const at = (minute: number) => {
      const { x, y } = wanderOffset(minute, WANDER_REACH_X_PX, WANDER_REACH_Y_PX);
      return `translate(${x}px, ${y}px)`;
    };
    const m0 = pixelShiftMinute(Date.now());
    expect(clock(container).style.transform).toBe(at(m0));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(clock(container).style.transform).toBe(at(m0 + 1));
    expect(at(m0 + 1)).not.toBe(at(m0));
    // It stays where StoryView pinned it; the drift is a transform on top.
    expect(clock(container).style.position).toBe('absolute');
  });
});

describe('FullscreenNewsModule front page', () => {
  it('renders the masthead, a lead story and the rest in a grid', () => {
    mockState = loaded(THREE);
    const { container } = renderNews(makeConfig({ view: 'front-page' }));

    expect(container.querySelector('[data-fullscreen-news-view="front-page"]')).not.toBeNull();
    expect(container.querySelector('[data-news-masthead]')?.textContent).toContain('Example News');
    expect(container.querySelector('[data-news-masthead]')?.textContent).toContain('Saturday, August 29');
    const headlines = [...container.querySelectorAll('[data-news-headline]')].map((el) => el.textContent);
    expect(headlines).toEqual(['Headline number 0', 'Headline number 1', 'Headline number 2']);
    expect(container.querySelectorAll('[data-news-story]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-news-grid] [data-news-story]')).toHaveLength(2);
    // Three stories fit on one page: no page dots.
    expect(container.querySelector('[data-news-pages]')).toBeNull();
  });

  it('pages six stories at a time', () => {
    mockState = loaded(Array.from({ length: 8 }, (_, i) => story(i)));
    const { container } = renderNews(makeConfig({ view: 'front-page', rotateIntervalMs: 5_000 }));
    const headlines = () => [...container.querySelectorAll('[data-news-headline]')].map((el) => el.textContent);

    expect(headlines()).toHaveLength(6);
    expect(headlines()[0]).toBe('Headline number 0');
    expect(container.querySelectorAll('[data-news-pages] span')).toHaveLength(2);

    act(() => { vi.advanceTimersByTime(5_100); });
    expect(headlines()).toEqual(['Headline number 6', 'Headline number 7']);
  });

  it('heads the page with the title the family gave it', () => {
    mockState = loaded(THREE);
    const { container } = renderNews(makeConfig({ view: 'front-page', showTime: false, title: '  The Miller Times ' }));
    expect(container.querySelector('[data-news-masthead]')?.textContent).toBe('The Miller Times');
  });

  it('does not head a page of several feeds with whichever is listed first', () => {
    mockState = loaded(THREE);
    const feeds = [
      { id: 'f1', url: 'https://example.com/feed.xml', label: 'Example News' },
      { id: 'f2', url: 'https://example.org/feed.xml', label: 'Other Paper' },
    ];
    const { container } = renderNews(makeConfig({ view: 'front-page', showTime: false, feeds }));
    expect(container.querySelector('[data-news-masthead]')?.textContent).toBe('News');
    cleanup();

    // A second row with no link yet is not a second feed.
    const draft = renderNews(makeConfig({ view: 'front-page', showTime: false, feeds: [feeds[0], { id: 'f3', url: ' ' }] }));
    expect(draft.container.querySelector('[data-news-masthead]')?.textContent).toBe('Example News');
  });

  it('keeps the pill on the lead only, and dots new stories in the grid', () => {
    mockState = { ...loaded(THREE.map((s, i) => (i === 1 ? { ...s, timestamp: NOW - 5 * 60_000 } : s))), newKeys: new Set([THREE[1], THREE[2]].map(newsItemKey)) };
    const { container } = renderNews(makeConfig({ view: 'front-page', showNewMarker: true }));
    expect(container.querySelectorAll('[data-news-breaking]')).toHaveLength(1);
    expect(container.querySelector('[data-news-grid] [data-news-breaking]')).toBeNull();
    expect(container.querySelectorAll('[data-news-grid] [data-news-new]')).toHaveLength(2);
    cleanup();

    // The dot keeps a grid card's meta row when source and age are both off.
    const bare = renderNews(makeConfig({ view: 'front-page', showNewMarker: true, showSource: false, showTimestamp: false }));
    expect(bare.container.querySelectorAll('[data-news-grid] [data-news-new]')).toHaveLength(2);
    cleanup();

    const off = renderNews(makeConfig({ view: 'front-page' }));
    expect(off.container.querySelector('[data-news-new]')).toBeNull();
  });

  it('uses the translated title when the first feed has no label', () => {
    mockState = loaded(THREE);
    const { container } = renderNews(makeConfig({
      view: 'front-page', showTime: false,
      feeds: [{ id: 'f1', url: 'https://example.com/feed.xml' }],
    }));
    expect(container.querySelector('[data-news-masthead]')?.textContent).toBe('News');
  });
});

describe('FullscreenNewsModule states', () => {
  it('asks for a feed when none is configured', () => {
    mockState = loaded([]);
    const { container } = renderNews(makeConfig({ feeds: [] }));
    expect(container.textContent).toContain('Add a news feed in the editor');
  });

  it('shows the loading state until the first response', () => {
    mockState = { ...loaded([]), data: null };
    const { container } = renderNews(makeConfig());
    expect(container.textContent).toContain('Loading news');
  });

  it('shows the empty state when every feed came back empty', () => {
    mockState = loaded([]);
    const { container } = renderNews(makeConfig());
    expect(container.textContent).toContain('No headlines');
  });
});

// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type FullscreenNewsConfig, type ModuleStyle } from '@/types/config';
import type { NewsDisplayItem } from '@/lib/news/types';
import type { NewsFeedsState } from '@/hooks/useNewsFeeds';
import { dispatchModuleCommand } from '@/hooks/useModuleCommand';
import { installResizeObserverStub, I18nWrapper as Wrapper } from '@/components/modules/__tests__/helpers/harness';

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

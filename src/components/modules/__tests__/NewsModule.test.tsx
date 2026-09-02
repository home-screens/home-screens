// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type NewsConfig, type ModuleStyle } from '@/types/config';
import type { NewsResponse } from '@/lib/news/types';
import { installResizeObserverStub, I18nWrapper as Wrapper } from './helpers/harness';
import { dispatchModuleCommand } from '@/hooks/useModuleCommand';

installResizeObserverStub();

let mockResponse: NewsResponse | null = null;
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (url: string) => [url ? mockResponse : null, null, null],
}));

import NewsModule from '../NewsModule';

const BBC = 'https://feeds.bbci.co.uk/news/rss.xml';
const OTHER = 'https://example.com/feed.xml';
const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };
const NOW = Date.now();

function response(): NewsResponse {
  return {
    feeds: [
      {
        url: BBC, ok: true, title: 'BBC News', format: 'rss', fetchedAt: NOW,
        items: [
          { id: 'a', title: 'ALPHA STORY', link: 'https://example.com/a', description: 'Alpha summary about parks.', timestamp: NOW - 5 * 60_000, imageUrl: null },
          { id: 'b', title: 'BRAVO STORY', link: 'https://example.com/b', description: 'Bravo summary.', timestamp: NOW - 3 * 3_600_000, imageUrl: 'https://img.example.com/b.jpg' },
          { id: 'c', title: 'CHARLIE STORY', link: null, description: '', timestamp: null, imageUrl: null },
        ],
      },
      { url: OTHER, ok: false, error: 'http-error', status: 404, items: [], fetchedAt: NOW },
    ],
  };
}

function makeConfig(overrides: Partial<NewsConfig> = {}): NewsConfig {
  return {
    feeds: [{ id: 'f1', url: BBC, label: 'Beeb' }, { id: 'f2', url: OTHER, label: 'Broken Feed' }],
    view: 'list',
    refreshIntervalMs: 300_000,
    rotateIntervalMs: 60_000,
    maxItems: 10,
    showTimestamp: true,
    showDescription: true,
    ...overrides,
  };
}

function renderNews(overrides: Partial<NewsConfig> = {}) {
  return render(<NewsModule config={makeConfig(overrides)} style={style} />, { wrapper: Wrapper });
}

afterEach(() => {
  cleanup();
  mockResponse = null;
});

describe('NewsModule', () => {
  it('shows the loading state until the feeds answer', () => {
    renderNews();
    expect(screen.getByText('Loading news…')).toBeTruthy();
  });

  it('asks for a feed when none is configured', () => {
    mockResponse = response();
    renderNews({ feeds: [] });
    expect(screen.getByText('Add a news feed in the editor and headlines show here')).toBeTruthy();
  });

  it('list view renders every story with source, age, and the unavailable footer', () => {
    mockResponse = response();
    const { container } = renderNews({ view: 'list' });
    expect(screen.getByText('ALPHA STORY')).toBeTruthy();
    expect(screen.getByText('BRAVO STORY')).toBeTruthy();
    expect(screen.getByText('CHARLIE STORY')).toBeTruthy();
    expect(screen.getAllByText(/Beeb · 5m ago/).length).toBe(1);
    expect(screen.getByText('Not available right now: Broken Feed')).toBeTruthy();
    // Story rows are tappable by default (tapAction 'qr').
    expect(container.querySelectorAll('button[data-news-story]').length).toBe(3);
  });

  it('headline view shows one story with a counter and moves on hub commands', () => {
    mockResponse = response();
    renderNews({ view: 'headline' });
    expect(screen.getByText('ALPHA STORY')).toBeTruthy();
    expect(screen.queryByText('BRAVO STORY')).toBeNull();
    expect(screen.getByText('1 of 3')).toBeTruthy();
    act(() => { dispatchModuleCommand({ module: 'news', action: 'next' }); });
    expect(screen.getByText('BRAVO STORY')).toBeTruthy();
    expect(screen.getByText('2 of 3')).toBeTruthy();
    act(() => { dispatchModuleCommand({ module: 'news', action: 'prev' }); });
    expect(screen.getByText('ALPHA STORY')).toBeTruthy();
    // A command for another module is ignored.
    act(() => { dispatchModuleCommand({ module: 'fullscreen-news', action: 'next' }); });
    expect(screen.getByText('ALPHA STORY')).toBeTruthy();
  });

  it('tapping a story opens the QR overlay and tapping again closes it', () => {
    mockResponse = response();
    const { container } = renderNews({ view: 'list', tapAction: 'qr' });
    fireEvent.click(screen.getByRole('button', { name: 'ALPHA STORY' }));
    const overlay = container.querySelector('[data-news-overlay="qr"]');
    expect(overlay).toBeTruthy();
    expect(overlay!.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Scan to read on your phone')).toBeTruthy();
    fireEvent.click(overlay!);
    expect(container.querySelector('[data-news-overlay]')).toBeNull();
  });

  it('details overlay shows the summary, and a story without a link says so', () => {
    mockResponse = response();
    const { container } = renderNews({ view: 'compact', tapAction: 'details' });
    fireEvent.click(screen.getByRole('button', { name: 'CHARLIE STORY' }));
    expect(container.querySelector('[data-news-overlay="details"]')).toBeTruthy();
    expect(screen.getByText('No summary for this story')).toBeTruthy();
    expect(container.querySelector('[data-news-overlay] svg')).toBeNull();
    act(() => { dispatchModuleCommand({ module: 'news', action: 'dismiss' }); });
    expect(container.querySelector('[data-news-overlay]')).toBeNull();
  });

  it('tapAction none renders plain rows', () => {
    mockResponse = response();
    const { container } = renderNews({ view: 'list', tapAction: 'none' });
    expect(container.querySelectorAll('button[data-news-story]').length).toBe(0);
    expect(container.querySelectorAll('[data-news-story]').length).toBe(3);
  });

  it('applies blocked words and the breaking pill', () => {
    mockResponse = response();
    const { container } = renderNews({ view: 'compact', blockedWords: 'bravo', highlightBreaking: true });
    expect(screen.queryByText('BRAVO STORY')).toBeNull();
    expect(screen.getByText('ALPHA STORY')).toBeTruthy();
    expect(container.querySelector('[data-news-breaking]')).toBeTruthy();
  });

  it('cards view lays stories out in the configured columns', () => {
    mockResponse = response();
    const { container } = renderNews({ view: 'cards', cardColumns: 3 });
    const grid = container.querySelector('[data-news-cards]') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(container.querySelectorAll('[data-news-thumb]').length).toBeGreaterThan(0);
  });

  it('ticker view carries the chosen separator and pauses on touch', () => {
    mockResponse = response();
    const { container } = renderNews({ view: 'ticker', tickerSeparator: 'pipe', showSource: true });
    expect(screen.getAllByText('|').length).toBeGreaterThan(0);
    const wrap = container.querySelector('[data-news-ticker-paused]');
    expect(wrap).toBeNull();
    fireEvent.pointerDown(container.querySelector('.animate-ticker-scroll')!);
    expect(container.querySelector('[data-news-ticker-paused="true"]')).toBeTruthy();
  });

  it('reports every feed failing as a single friendly empty state', () => {
    mockResponse = { feeds: [{ url: BBC, ok: false, error: 'timeout', items: [], fetchedAt: NOW }] };
    renderNews({ feeds: [{ id: 'f1', url: BBC }] });
    expect(screen.getByText('News is not available right now')).toBeTruthy();
  });
});

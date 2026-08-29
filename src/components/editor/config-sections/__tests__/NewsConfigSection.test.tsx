// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, within, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import type { ModuleInstance, NewsFeedSource } from '@/types/config';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';

const editorFetch = vi.fn();
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => editorFetch(...args),
  isSessionExpired: () => false,
}));

// The section reads config through the store hook — feed it directly.
const moduleState = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  set: vi.fn(),
}));
vi.mock('@/hooks/useModuleConfig', () => ({
  useModuleConfig: () => ({ config: moduleState.config, set: moduleState.set }),
}));

// The add-feed menu reads the household locale + location from the editor store.
const storeState = vi.hoisted(() => ({
  config: { settings: { locale: 'en-US', locationName: 'Boulder, CO' } as Record<string, unknown> },
}));
vi.mock('@/stores/editor-store', () => ({
  useEditorStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

import { NewsConfigSection } from '../NewsConfigSection';

const BBC: NewsFeedSource = { id: 'f-bbc', url: 'https://feeds.bbci.co.uk/news/rss.xml', label: 'BBC News' };
const mod = { id: 'm1', type: 'news' } as ModuleInstance;

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      {children}
    </I18nProvider>
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderSection(): RenderResult {
  return render(<NewsConfigSection mod={mod} screenId="s1" />, { wrapper: Wrapper });
}

function chooseAddKind(view: RenderResult, kind: string) {
  fireEvent.change(view.getByLabelText('Add a feed'), { target: { value: kind } });
}

beforeEach(() => {
  editorFetch.mockReset();
  editorFetch.mockResolvedValue(jsonResponse({ feeds: [] }));
  moduleState.set.mockReset();
  moduleState.config = { feeds: [BBC], view: 'list', maxItems: 10 };
  storeState.config.settings = { locale: 'en-US', locationName: 'Boulder, CO' };
});
afterEach(() => {
  cleanup();
});

describe('NewsConfigSection — feeds', () => {
  it('lists the current feeds by their readable name', () => {
    const view = renderSection();
    expect(view.getByText('BBC News')).toBeTruthy();
    expect(view.getByText('BBC News · Top stories')).toBeTruthy();
    expect(view.getByText('1 / 12')).toBeTruthy();
  });

  it('offers the presets for the household language, grouped by section', () => {
    storeState.config.settings = { locale: 'de-DE', locationName: '' };
    const view = renderSection();
    const select = view.getByLabelText('Feed') as HTMLSelectElement;
    const labels = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toContain('tagesschau · Top stories');
    expect(labels.some((l) => l?.startsWith('BBC News'))).toBe(false);
    expect(within(select).getAllByRole('group').map((g) => g.getAttribute('label'))).toContain('Top stories');
  });

  it('marks presets that are already in the list', () => {
    const view = renderSection();
    const select = view.getByLabelText('Feed') as HTMLSelectElement;
    const added = within(select).getByRole('option', { name: 'BBC News · Top stories (added)' }) as HTMLOptionElement;
    expect(added.disabled).toBe(true);
  });

  it('appends a preset with the publisher as its label', () => {
    const view = renderSection();
    fireEvent.change(view.getByLabelText('Feed'), { target: { value: 'npr-top' } });
    fireEvent.click(view.getByRole('button', { name: 'Add' }));
    expect(moduleState.set).toHaveBeenCalledTimes(1);
    const { feeds } = moduleState.set.mock.calls[0][0] as { feeds: NewsFeedSource[] };
    expect(feeds).toHaveLength(2);
    expect(feeds[0]).toEqual(BBC);
    expect(feeds[1]).toMatchObject({ url: 'https://feeds.npr.org/1001/rss.xml', label: 'NPR' });
    expect(feeds[1].id).toBeTruthy();
  });

  it('appends a custom feed link', () => {
    const view = renderSection();
    chooseAddKind(view, 'custom');
    fireEvent.change(view.getByLabelText('Feed link'), { target: { value: 'https://example.com/feed.xml' } });
    fireEvent.click(view.getByRole('button', { name: 'Add' }));
    const { feeds } = moduleState.set.mock.calls[0][0] as { feeds: NewsFeedSource[] };
    expect(feeds.map((f) => f.url)).toEqual([BBC.url, 'https://example.com/feed.xml']);
  });

  it('refuses a custom link that is not http(s)', () => {
    const view = renderSection();
    chooseAddKind(view, 'custom');
    fireEvent.change(view.getByLabelText('Feed link'), { target: { value: 'example.com/feed.xml' } });
    fireEvent.click(view.getByRole('button', { name: 'Add' }));
    expect(moduleState.set).not.toHaveBeenCalled();
    expect(view.getByRole('alert').textContent).toMatch(/http:\/\/ or https:\/\//);
  });

  it('stores topic, YouTube, and subreddit sources as their shorthand', () => {
    const view = renderSection();

    chooseAddKind(view, 'topic');
    fireEvent.change(view.getByLabelText('Words to follow'), { target: { value: 'space launches' } });
    fireEvent.click(view.getByRole('button', { name: 'Add' }));

    chooseAddKind(view, 'youtube');
    fireEvent.change(view.getByLabelText('Channel link or ID'), {
      target: { value: 'https://www.youtube.com/channel/UCsXVk37bltHxD1rDPwtNM8Q' },
    });
    fireEvent.click(view.getByRole('button', { name: 'Add' }));

    chooseAddKind(view, 'reddit');
    fireEvent.change(view.getByLabelText('Subreddit name'), { target: { value: 'r/space' } });
    fireEvent.click(view.getByRole('button', { name: 'Add' }));

    const urls = moduleState.set.mock.calls.map((c) => (c[0] as { feeds: NewsFeedSource[] }).feeds.at(-1)?.url);
    expect(urls).toEqual(['topic:space launches', 'youtube:UCsXVk37bltHxD1rDPwtNM8Q', 'reddit:space']);
  });

  it('explains what to paste when a YouTube handle is given', () => {
    const view = renderSection();
    chooseAddKind(view, 'youtube');
    fireEvent.change(view.getByLabelText('Channel link or ID'), { target: { value: '@kurzgesagt' } });
    fireEvent.click(view.getByRole('button', { name: 'Add' }));
    expect(moduleState.set).not.toHaveBeenCalled();
    expect(view.getByRole('alert').textContent).toMatch(/\/channel\/UC/);
  });

  it('removes a feed', () => {
    const view = renderSection();
    fireEvent.click(view.getByRole('button', { name: 'Remove BBC News' }));
    expect(moduleState.set).toHaveBeenCalledWith({ feeds: [] });
  });

  it('reorders feeds with the up and down buttons', () => {
    const npr: NewsFeedSource = { id: 'f-npr', url: 'https://feeds.npr.org/1001/rss.xml', label: 'NPR' };
    moduleState.config = { feeds: [BBC, npr], view: 'list' };
    const view = renderSection();
    expect((view.getByRole('button', { name: 'Move BBC News up' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Move BBC News down' }));
    expect(moduleState.set).toHaveBeenCalledWith({ feeds: [npr, BBC] });
  });

  it('checks a feed and reports its title and story count', async () => {
    const now = Date.now();
    editorFetch.mockImplementation(async (url: string) => {
      if (url === `/api/news?feed=${encodeURIComponent(BBC.url)}`) {
        return jsonResponse({
          feeds: [{
            url: BBC.url, ok: true, title: 'BBC News Home', format: 'rss', fetchedAt: now,
            items: [
              { id: '1', title: 'One', link: null, description: '', timestamp: now - 12 * 60_000, imageUrl: null },
              { id: '2', title: 'Two', link: null, description: '', timestamp: now - 3 * 3_600_000, imageUrl: null },
            ],
          }],
        });
      }
      return jsonResponse({ feeds: [] });
    });

    const view = renderSection();
    fireEvent.click(view.getByRole('button', { name: 'Edit BBC News' }));
    fireEvent.click(view.getByRole('button', { name: 'Check' }));
    const status = await view.findByRole('status');
    expect(status.textContent).toBe('BBC News Home · 2 stories · newest 12m ago');
  });

  it('turns a feed error into a friendly sentence', async () => {
    editorFetch.mockResolvedValue(jsonResponse({
      feeds: [{ url: BBC.url, ok: false, error: 'http-error', status: 404, items: [], fetchedAt: Date.now() }],
    }));
    const view = renderSection();
    fireEvent.click(view.getByRole('button', { name: 'Edit BBC News' }));
    fireEvent.click(view.getByRole('button', { name: 'Check' }));
    const status = await view.findByRole('status');
    expect(status.textContent).toBe('That feed answered with an error (404).');
  });

  it('only offers the home-network switch for real feed links', () => {
    moduleState.config = { feeds: [BBC, { id: 'f-local', url: 'local' }], view: 'list' };
    const view = renderSection();
    fireEvent.click(view.getByRole('button', { name: 'Edit BBC News' }));
    expect(view.getByText('Home network')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Edit Local news' }));
    expect(view.getAllByText('Home network')).toHaveLength(1);
  });
});

describe('NewsConfigSection — local news', () => {
  it('is disabled until a location is set', () => {
    storeState.config.settings = { locale: 'en-US', locationName: '' };
    const view = renderSection();
    chooseAddKind(view, 'local');
    const button = view.getByRole('button', { name: 'Add local news' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(view.getByText('Set your location in Settings first')).toBeTruthy();
  });

  it('adds the local source once a location exists', () => {
    const view = renderSection();
    chooseAddKind(view, 'local');
    expect(view.getByText('Shows stories about Boulder, CO.')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Add local news' }));
    const { feeds } = moduleState.set.mock.calls[0][0] as { feeds: NewsFeedSource[] };
    expect(feeds.at(-1)?.url).toBe('local');
  });
});

describe('NewsConfigSection — view options', () => {
  it('keeps the Max Items slider for non-headline views and the rotate slider for headline', () => {
    const view = renderSection();
    expect(view.getByRole('slider', { name: /^Max Items/ })).toBeTruthy();
    expect(view.queryByRole('slider', { name: /^Rotate Headlines \(seconds\)/ })).toBeNull();
    cleanup();

    moduleState.config = { feeds: [BBC], view: 'headline' };
    const headline = renderSection();
    expect(headline.getByRole('slider', { name: /^Rotate Headlines \(seconds\)/ })).toBeTruthy();
    expect(headline.queryByRole('slider', { name: /^Max Items/ })).toBeNull();
  });

  it('writes filter changes through to the config', () => {
    const view = renderSection();
    fireEvent.change(view.getByLabelText('Hide stories older than'), { target: { value: '24' } });
    expect(moduleState.set).toHaveBeenCalledWith({ maxAgeHours: 24 });
    fireEvent.change(view.getByLabelText('When a story is tapped'), { target: { value: 'details' } });
    expect(moduleState.set).toHaveBeenCalledWith({ tapAction: 'details' });
  });
});

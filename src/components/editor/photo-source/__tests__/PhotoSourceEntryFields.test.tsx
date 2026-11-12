// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import type { PhotoSource } from '@/types/config';

const editorFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editor-fetch', () => ({ editorFetch, isSessionExpired: () => false, sessionExpired: () => new Error('expired') }));
const secrets = vi.hoisted(() => ({ status: {} as Record<string, boolean> }));
vi.mock('@/hooks/useSecretStatus', () => ({
  useSecretStatus: () => ({ status: secrets.status, loading: false, error: false, hasStatus: true, refetch: () => {} }),
}));
vi.mock('@/stores/editor-store', () => ({
  useEditorStore: () => ({ config: null, selectedDisplayId: null }),
}));
// The question asked before a mode switch drops picks; `answer` is what the person says.
const confirm = vi.hoisted(() => ({ answer: true, confirm: vi.fn(async () => confirm.answer) }));
vi.mock('@/stores/confirm-store', () => ({
  useConfirmStore: { getState: () => ({ confirm: confirm.confirm }) },
}));

import PhotoSourceEntryFields from '../PhotoSourceEntryFields';

beforeEach(() => {
  secrets.status = { immich_url: true, immich_api_key: true, unsplash_access_key: true };
  confirm.answer = true;
  confirm.confirm.mockClear();
  editorFetch.mockReset();
  editorFetch.mockImplementation(async (url: string) => {
    const body = url.startsWith('/api/immich/validate') ? { reachable: true, authenticated: true }
      : url.startsWith('/api/photo-source/browse') ? { items: [], nextPage: null }
        : [];
    return { ok: true, status: 200, json: async () => body, headers: new Headers() };
  });
});
afterEach(cleanup);

const wrap = (ui: React.ReactElement) => <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{ui}</I18nProvider>;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function renderEntry(source: PhotoSource) {
  const onChange = vi.fn();
  render(wrap(<PhotoSourceEntryFields use="background" source={source} count={50} onChange={onChange} />));
  return onChange;
}

describe('PhotoSourceEntryFields', () => {
  it('library: Pictures mode keeps the folder, and leaving it with picks asks first', async () => {
    let onChange = renderEntry({ kind: 'library', folder: 'kids' });
    await settle();
    expect(screen.getByTestId('library-mode-folder').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('library-mode-pictures'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'library', folder: 'kids', pictures: [] });
    expect(confirm.confirm).not.toHaveBeenCalled();

    // Nothing picked: back to Folder without a question.
    cleanup();
    onChange = renderEntry({ kind: 'library', folder: 'kids', pictures: [] });
    await settle();
    fireEvent.click(screen.getByTestId('library-mode-folder'));
    await settle();
    expect(confirm.confirm).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith({ kind: 'library', folder: 'kids' });

    // Two picks: the switch asks, and a "no" changes nothing.
    cleanup();
    onChange = renderEntry({ kind: 'library', folder: '', pictures: ['kids/a.jpg', 'kids/b.jpg'] });
    await settle();
    expect(screen.getByTestId('library-mode-pictures').getAttribute('aria-pressed')).toBe('true');
    confirm.answer = false;
    fireEvent.click(screen.getByTestId('library-mode-folder'));
    await settle();
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Switching to Folder forgets the 2 pictures you picked here. Undo brings them back.',
      variant: 'danger',
    }));
    expect(onChange).not.toHaveBeenCalled();
    confirm.answer = true;
    fireEvent.click(screen.getByTestId('library-mode-folder'));
    await settle();
    expect(onChange).toHaveBeenCalledWith({ kind: 'library', folder: '' });
  });

  it('Immich: picked photos sit beside the filters, which come back when the picks are dropped', async () => {
    let onChange = renderEntry({ kind: 'immich', albumIds: ['a1'], favoritesOnly: true });
    await settle();
    expect(screen.getByTestId('immich-mode-filters').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('immich-mode-pictures'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'immich', albumIds: ['a1'], favoritesOnly: true, assetIds: [] });

    cleanup();
    onChange = renderEntry({ kind: 'immich', albumIds: ['a1'], assetIds: ['x1'] });
    await settle();
    expect(screen.getByTestId('immich-mode-pictures').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('immich-mode-filters'));
    await settle();
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Switching to Filters forgets the picture you picked here. Undo brings it back.',
    }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'immich', albumIds: ['a1'] });
  });

  it('Unsplash: a list that exists is the mode; words and collections survive a trip through Pictures', async () => {
    let onChange = renderEntry({ kind: 'unsplash', query: 'lake' });
    await settle();
    expect(screen.getByTestId('unsplash-mode-words').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('unsplash-mode-collections'));
    await settle();
    expect(onChange).toHaveBeenCalledWith({ kind: 'unsplash', query: 'lake', collections: [] });
    fireEvent.click(screen.getByTestId('unsplash-mode-pictures'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'unsplash', query: 'lake', photoIds: [] });
    expect(confirm.confirm).not.toHaveBeenCalled();

    // From Pictures (with a pick) back to Collections: the collections kept on the entry stand.
    cleanup();
    onChange = renderEntry({ kind: 'unsplash', query: 'lake', collections: ['c1'], photoIds: ['p1'] });
    await settle();
    expect(screen.getByTestId('unsplash-mode-pictures').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('unsplash-mode-collections'));
    await settle();
    expect(confirm.confirm).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ kind: 'unsplash', query: 'lake', collections: ['c1'] });

    // Collections to Words drops the collections (a list that stayed would be the mode) and asks.
    cleanup();
    onChange = renderEntry({ kind: 'unsplash', query: '', collections: ['c1', 'c2'] });
    await settle();
    expect(screen.getByTestId('unsplash-mode-collections').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('unsplash-mode-words'));
    await settle();
    expect(confirm.confirm).toHaveBeenLastCalledWith(expect.objectContaining({
      message: 'Switching to Words forgets the 2 collections you added here. Undo brings them back.',
    }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'unsplash', query: 'nature landscape' });
  });

  it('library pictures: every pick is listed above the grid, and a click on one takes it out', async () => {
    const onChange = renderEntry({ kind: 'library', folder: 'trips', pictures: ['kids/a.jpg', 'top.jpg'] });
    await settle();
    const strip = screen.getByTestId('picked-strip');
    expect(strip.querySelectorAll('button')).toHaveLength(2);
    expect(screen.getByTestId('picked-kids/a.jpg').getAttribute('aria-label')).toBe('Take out a.jpg');
    fireEvent.click(screen.getByTestId('picked-top.jpg'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'library', folder: 'trips', pictures: ['kids/a.jpg'] });
  });

  it('Unsplash pictures: picks from an earlier visit are asked about once and shown with their pictures', async () => {
    editorFetch.mockImplementation(async (url: string) => {
      const body = url.includes('collection=picked')
        ? { items: [{ ref: 'earlier1', thumbUrl: 'https://images.unsplash.com/s-earlier1', label: 'A lake' }], nextPage: null }
        : url.startsWith('/api/photo-source/browse') ? { items: [], nextPage: null } : [];
      return { ok: true, status: 200, json: async () => body, headers: new Headers() };
    });
    const onChange = renderEntry({ kind: 'unsplash', query: '', photoIds: ['earlier1', 'gone2'] });
    await waitFor(() => expect(screen.getByTestId('picked-earlier1').querySelector('img')).not.toBeNull());
    const asks = editorFetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('collection=picked'));
    expect(asks).toEqual(['/api/photo-source/browse?kind=unsplash&collection=picked&refs=earlier1,gone2']);
    expect(screen.getByTestId('picked-earlier1').querySelector('img')?.getAttribute('src')).toBe('https://images.unsplash.com/s-earlier1');
    expect(screen.getByTestId('picked-earlier1').getAttribute('aria-label')).toBe('Take out A lake');
    // A pick Unsplash no longer has stays listed, without a picture, so it can still be taken out.
    expect(screen.getByTestId('picked-gone2').querySelector('img')).toBeNull();
    fireEvent.click(screen.getByTestId('picked-gone2'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'unsplash', query: '', photoIds: ['earlier1'] });
  });

  it('Immich pictures: each pick shows by its id, whatever album the grid is on', async () => {
    renderEntry({ kind: 'immich', assetIds: ['11111111-2222-3333-4444-555555555555'] });
    await settle();
    expect(screen.getByTestId('picked-11111111-2222-3333-4444-555555555555').querySelector('img')?.getAttribute('src'))
      .toBe('/api/immich/serve?assetId=11111111-2222-3333-4444-555555555555&size=thumbnail');
  });

  it('a background folder that holds only videos says so instead of reading as empty', async () => {
    editorFetch.mockImplementation(async (url: string) => ({
      ok: true, status: 200, headers: new Headers(),
      json: async () => (url.includes('media=videos') ? [{ url: '/api/backgrounds/serve?file=clips%2Fa.mp4', type: 'video' }] : []),
    }));
    renderEntry({ kind: 'library', folder: 'clips' });
    await waitFor(() => expect(screen.getByTestId('photo-source-folder-empty').textContent).toBe('This folder only has videos. A background needs a still picture.'));

    // A folder with nothing in it keeps the plain line.
    cleanup();
    editorFetch.mockImplementation(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => [] }));
    renderEntry({ kind: 'library', folder: 'empty' });
    await waitFor(() => expect(screen.getByTestId('photo-source-folder-empty').textContent).toBe('No photos in this folder yet'));
  });

  it('Unsplash words that find nothing say so, and words that find photos do not', async () => {
    vi.useFakeTimers();
    try {
      renderEntry({ kind: 'unsplash', query: 'zzqxv nonsense' });
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      expect(screen.getByTestId('unsplash-words-empty').textContent).toBe('Nothing found for these words. Try others.');

      cleanup();
      editorFetch.mockImplementation(async () => ({
        ok: true, status: 200, headers: new Headers(),
        json: async () => [{ url: 'https://images.unsplash.com/a', type: 'image' }],
      }));
      renderEntry({ kind: 'unsplash', query: 'lakes' });
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      expect(screen.queryByTestId('unsplash-words-empty')).toBeNull();
      expect(screen.getByTestId('photo-source-preview')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('walls have no fields here: they are picked as tiles in the Sources list', async () => {
    const { container } = render(wrap(<PhotoSourceEntryFields use="background" source={{ kind: 'wall', group: 'color', ids: [] }} count={50} onChange={vi.fn()} />));
    await settle();
    expect(container.textContent).toBe('');
  });
});

// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('walls have no fields here: they are picked as tiles in the Sources list', async () => {
    const { container } = render(wrap(<PhotoSourceEntryFields use="background" source={{ kind: 'wall', group: 'color', ids: [] }} count={50} onChange={vi.fn()} />));
    await settle();
    expect(container.textContent).toBe('');
  });
});

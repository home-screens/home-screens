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

import PhotoSourceEntryFields from '../PhotoSourceEntryFields';

beforeEach(() => {
  secrets.status = { immich_url: true, immich_api_key: true, unsplash_access_key: true };
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
  it('library: switching between the folder and chosen pictures clears the other', async () => {
    let onChange = renderEntry({ kind: 'library', folder: 'kids' });
    await settle();
    expect(screen.getByTestId('library-mode-folder').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('library-mode-pictures'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'library', folder: '', pictures: [] });

    cleanup();
    onChange = renderEntry({ kind: 'library', folder: '', pictures: ['kids/a.jpg'] });
    await settle();
    expect(screen.getByTestId('library-mode-pictures').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('library-mode-folder'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'library', folder: '' });
  });

  it('Immich: switching between the filters and picked photos clears the other', async () => {
    let onChange = renderEntry({ kind: 'immich', albumIds: ['a1'], favoritesOnly: true });
    await settle();
    expect(screen.getByTestId('immich-mode-filters').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('immich-mode-pictures'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'immich', assetIds: [] });

    cleanup();
    onChange = renderEntry({ kind: 'immich', assetIds: ['x1'] });
    await settle();
    expect(screen.getByTestId('immich-mode-pictures').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('immich-mode-filters'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'immich' });
  });

  it('Unsplash: words, collections and picked photos are exclusive modes', async () => {
    let onChange = renderEntry({ kind: 'unsplash', query: 'lake' });
    await settle();
    expect(screen.getByTestId('unsplash-mode-words').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('unsplash-mode-collections'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'unsplash', query: '', collections: [] });
    fireEvent.click(screen.getByTestId('unsplash-mode-pictures'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'unsplash', query: '', photoIds: [] });

    cleanup();
    onChange = renderEntry({ kind: 'unsplash', query: '', collections: ['c1'] });
    await settle();
    expect(screen.getByTestId('unsplash-mode-collections').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('unsplash-mode-words'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'unsplash', query: 'nature landscape' });

    cleanup();
    onChange = renderEntry({ kind: 'unsplash', query: '', photoIds: ['p1'] });
    await settle();
    expect(screen.getByTestId('unsplash-mode-pictures').getAttribute('aria-pressed')).toBe('true');
  });

  it('walls have no fields here: they are picked as tiles in the Sources list', async () => {
    const { container } = render(wrap(<PhotoSourceEntryFields use="background" source={{ kind: 'wall', group: 'color', ids: [] }} count={50} onChange={vi.fn()} />));
    await settle();
    expect(container.textContent).toBe('');
  });
});

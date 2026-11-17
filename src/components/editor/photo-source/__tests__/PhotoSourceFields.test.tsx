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

import PhotoSourceFields from '../PhotoSourceFields';

beforeEach(() => {
  secrets.status = {};
  editorFetch.mockReset();
  editorFetch.mockImplementation(async (url: string) => {
    const body = url.startsWith('/api/immich/validate') ? { reachable: true, authenticated: true }
      : url.startsWith('/api/onedrive/status') ? { credentialsConfigured: false, connected: false }
        : url.startsWith('/api/auth/google/apps') ? { photos: { mode: 'own', hostedAvailable: false } }
          : [];
    return { ok: true, status: 200, json: async () => body, headers: new Headers() };
  });
});
afterEach(cleanup);

const wrap = (ui: React.ReactElement) => <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{ui}</I18nProvider>;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function renderFields(use: 'stream' | 'background', photoSource: PhotoSource, extra: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const view = render(wrap(<PhotoSourceFields use={use} value={{ photoSource, ...extra }} onChange={onChange} />));
  const sourceSelect = () => screen.getByDisplayValue(/^Library|Immich|iCloud|OneDrive|Unsplash|NASA/) as HTMLSelectElement;
  return { onChange, view, sourceSelect };
}

const labels = () => Array.from(document.querySelectorAll('span')).map((s) => s.textContent);

describe('PhotoSourceFields', () => {
  it.each(['stream', 'background'] as const)('lists every source for a %s, saying which still need setting up', async (use) => {
    secrets.status = { immich_url: true, immich_api_key: true };
    const { sourceSelect } = renderFields(use, { kind: 'library', folder: '' });
    await settle();
    expect(Array.from(sourceSelect().options).map((o) => o.text)).toEqual([
      'Library',
      'Immich',
      'iCloud shared album',
      'OneDrive (needs setting up)',
      'Unsplash (needs a free key)',
      'NASA picture of the day',
      'Paintings from museums',
    ]);
  });

  it('starts a fresh source when the kind changes', async () => {
    const { onChange, sourceSelect } = renderFields('stream', { kind: 'library', folder: 'kids' });
    await settle();
    fireEvent.change(sourceSelect(), { target: { value: 'unsplash' } });
    expect(onChange).toHaveBeenCalledWith({ photoSource: { kind: 'unsplash', query: 'nature landscape' } });
  });

  it('warns under the list when the chosen source has no key, in words for each use', async () => {
    renderFields('stream', { kind: 'unsplash', query: 'lake' });
    await settle();
    expect(screen.getByTestId('photo-source-key-missing').textContent).toContain('no new pictures come in');
    cleanup();
    renderFields('background', { kind: 'unsplash', query: 'lake' });
    await settle();
    expect(screen.getByTestId('photo-source-key-missing').textContent).toContain('keeps its last picture');
  });

  it('has no per-refresh count for a library folder, which plays all of itself', async () => {
    renderFields('stream', { kind: 'library', folder: '' });
    await settle();
    expect(labels()).not.toContain('Photos per Refresh');
    cleanup();
    secrets.status = { immich_url: true, immich_api_key: true };
    renderFields('stream', { kind: 'immich' }, { count: 80 });
    await settle();
    expect(labels()).toContain('Photos per Refresh');
  });

  it('holds an Unsplash count to one request of 30', async () => {
    secrets.status = { unsplash_access_key: true };
    renderFields('stream', { kind: 'unsplash', query: 'lake' }, { count: 100 });
    await settle();
    const slider = document.querySelector('input[type=range]') as HTMLInputElement;
    expect(slider.max).toBe('30');
    expect(slider.value).toBe('30');
  });

  it('offers videos only where the source plays them, and never for a background', async () => {
    const shows = () => labels().includes('Show');
    renderFields('stream', { kind: 'library', folder: '' });
    await settle();
    expect(shows()).toBe(true);
    cleanup();
    renderFields('stream', { kind: 'onedrive', folderId: '' });
    await settle();
    expect(shows()).toBe(false);
    cleanup();
    renderFields('background', { kind: 'library', folder: '' });
    await settle();
    expect(shows()).toBe(false);
  });
});

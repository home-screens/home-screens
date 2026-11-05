// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';

const editorFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editor-fetch', () => ({ editorFetch, isSessionExpired: () => false, sessionExpired: () => new Error('expired') }));
const secrets = vi.hoisted(() => ({ status: {} as Record<string, boolean> }));
vi.mock('@/hooks/useSecretStatus', () => ({
  useSecretStatus: () => ({ status: secrets.status, loading: false, error: false, hasStatus: true, refetch: () => {} }),
}));

import PicturePicker from '../PicturePicker';

type Route = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;
let routes: Route[] = [];
const calls: Array<{ url: string; init?: RequestInit }> = [];

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, headers: new Headers() };
}

beforeEach(() => {
  calls.length = 0;
  secrets.status = {};
  routes = [];
  editorFetch.mockReset();
  editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    for (const route of routes) {
      const hit = route(url, init);
      if (hit) return respond(hit.status ?? 200, hit.body);
    }
    if (url.startsWith('/api/backgrounds/directories')) return respond(200, { directories: [{ path: '', name: 'All Photos', imageCount: 0 }] });
    if (url.startsWith('/api/backgrounds')) return respond(200, []);
    if (url.startsWith('/api/auth/google/apps')) return respond(200, { photos: { mode: 'own', hostedAvailable: false } });
    if (url.startsWith('/api/google-picker/status')) return respond(200, { connected: false, credentialsConfigured: false });
    return respond(404, {});
  });
});
afterEach(cleanup);

const wrap = (ui: React.ReactElement) => <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{ui}</I18nProvider>;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const tabNames = () => screen.queryAllByRole('tab').map((tab) => tab.textContent);

describe('PicturePicker tabs', () => {
  it('offers every source that picks one picture, Built-in first where the spot has built-ins', async () => {
    render(wrap(<PicturePicker mode="pick-image" builtIn="backgrounds" onClose={() => {}} />));
    await settle();
    expect(tabNames()).toEqual(['Built-in', 'Local', 'Immich', 'Unsplash', 'NASA']);
    // No current picture: a spot with built-ins opens on them.
    expect(screen.getByTestId('picker-tab-builtin').getAttribute('aria-selected')).toBe('true');
  });

  it('keeps a source without its key, locked, with a hint where its pictures would be', async () => {
    render(wrap(<PicturePicker mode="pick-image" onClose={() => {}} />));
    await settle();
    expect(screen.getByTestId('picker-tab-unsplash').querySelector('svg')).not.toBeNull();
    // NASA's library search needs no key, so it never carries the lock.
    expect(screen.getByTestId('picker-tab-nasa').querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByTestId('picker-tab-unsplash'));
    await settle();
    expect(screen.getByTestId('picker-setup-hint').textContent).toContain('Unsplash needs a free key');
  });

  it('shows the library alone when picking a video or a folder', async () => {
    for (const mode of ['pick-video', 'manage-directory'] as const) {
      const view = render(wrap(<PicturePicker mode={mode} onClose={() => {}} />));
      await settle();
      expect(tabNames()).toEqual([]);
      view.unmount();
    }
  });

  it('opens on the library tab when the spot holds a library picture', async () => {
    render(wrap(<PicturePicker mode="pick-image" builtIn="day-art" currentValue="/api/backgrounds/serve?file=calendar-art%2Fparty.png" onClose={() => {}} />));
    await settle();
    expect(screen.getByTestId('picker-tab-library').getAttribute('aria-selected')).toBe('true');
    expect(calls.some((c) => c.url === '/api/backgrounds?media=both&directory=calendar-art')).toBe(true);
  });
});

describe('PicturePicker current picture', () => {
  it('starts with the library picture the spot holds chosen, in its folder', async () => {
    const OWN = '/api/backgrounds/serve?file=kids%2Fparty.png';
    routes.push((url) => (url === '/api/backgrounds?media=both&directory=kids' ? { body: [{ url: OWN, type: 'image' }] } : undefined));
    render(wrap(<PicturePicker mode="pick-image" currentValue={OWN} onClose={() => {}} />));
    await settle();
    await settle();
    expect(screen.getByTestId('picker-confirm').hasAttribute('disabled')).toBe(false);
    expect(document.querySelector('[data-media-type="image"] button')?.className).toContain('border-hs-accent');
  });
});

describe('PicturePicker Unsplash limit', () => {
  it("says the free plan's hourly searches are used up, rather than just failing", async () => {
    secrets.status = { unsplash_access_key: true };
    routes.push((url) => (url.startsWith('/api/photo-source/browse') ? { status: 429, body: { error: 'unsplash-rate-limit' } } : undefined));
    render(wrap(<PicturePicker mode="pick-image" onClose={() => {}} />));
    await settle();
    fireEvent.click(screen.getByTestId('picker-tab-unsplash'));
    await settle();
    expect(screen.getByTestId('picker-setup-hint').textContent).toContain('50 searches an hour');
  });
});

describe('PicturePicker built-in pictures', () => {
  it('stores a built-in picture as it is, with nothing copied', async () => {
    const onSelectImage = vi.fn();
    const onClose = vi.fn();
    render(wrap(<PicturePicker mode="pick-image" builtIn="day-art" onSelectImage={onSelectImage} onClose={onClose} />));
    await settle();
    fireEvent.click(screen.getByTestId('starter-picture-halloween'));
    expect(screen.getByTestId('picker-hint').textContent).toContain('Comes with Home Screens');
    await act(async () => { fireEvent.click(screen.getByTestId('picker-confirm')); });
    expect(onSelectImage).toHaveBeenCalledWith('/starter-day-art/halloween.svg');
    expect(onClose).toHaveBeenCalled();
    expect(calls.some((c) => c.url === '/api/photo-source/import')).toBe(false);
  });
});

describe('PicturePicker Immich tab', () => {
  const immichReady = () => {
    secrets.status = { immich_url: true, immich_api_key: true };
    routes.push((url) => (url === '/api/immich/validate' ? { body: { reachable: true, authenticated: true } } : undefined));
    routes.push((url) => (url === '/api/immich/people' ? { body: [] } : undefined));
  };

  it('lists albums like folders, browses one newest first, and copies the chosen photo on Select Image', async () => {
    immichReady();
    routes.push((url) => (url === '/api/immich/albums' ? { body: [{ id: 'a1', name: 'Summer trip', assetCount: 48 }] } : undefined));
    routes.push((url) => (url.startsWith('/api/photo-source/browse') ? { body: { items: [{ ref: 'abc-1', thumbUrl: '/t/1.jpg' }], nextPage: null } } : undefined));
    routes.push((url, init) => (url === '/api/photo-source/import' && init?.method === 'POST'
      ? { status: 201, body: { path: '/api/backgrounds/serve?file=immich%2Fimmich-abc-1.jpg', file: 'immich/immich-abc-1.jpg', reused: false } }
      : undefined));
    const onSelectImage = vi.fn();
    render(wrap(<PicturePicker mode="pick-image" onSelectImage={onSelectImage} onClose={() => {}} />));
    await settle();
    fireEvent.click(screen.getByTestId('picker-tab-immich'));
    await settle();
    fireEvent.click(screen.getByTestId('immich-album-a1'));
    await settle();
    expect(calls.some((c) => c.url === '/api/photo-source/browse?kind=immich&collection=album%3Aa1&page=1')).toBe(true);
    // Album counts include videos, so the bar names only the order.
    expect(screen.getByTestId('picker-bar-label').textContent).toBe('Summer trip(newest first)');

    fireEvent.click(document.querySelector('[data-ref="abc-1"]')!);
    expect(screen.getByTestId('picker-hint').textContent).toContain("library's Immich folder");
    await act(async () => { fireEvent.click(screen.getByTestId('picker-confirm')); });
    await settle();
    const post = calls.find((c) => c.url === '/api/photo-source/import');
    expect(JSON.parse(String(post?.init?.body))).toEqual({ kind: 'immich', ref: 'abc-1' });
    expect(onSelectImage).toHaveBeenCalledWith('/api/backgrounds/serve?file=immich%2Fimmich-abc-1.jpg');
  });

  it('says which box to tick when the key cannot see albums, and still shows photos', async () => {
    immichReady();
    routes.push((url) => (url === '/api/immich/albums' ? { status: 403, body: { error: 'missing-permission', permission: 'album.read' } } : undefined));
    routes.push((url) => (url.startsWith('/api/photo-source/browse') ? { body: { items: [{ ref: 'abc-2', thumbUrl: '/t/2.jpg' }], nextPage: null } } : undefined));
    render(wrap(<PicturePicker mode="pick-image" onClose={() => {}} />));
    await settle();
    fireEvent.click(screen.getByTestId('picker-tab-immich'));
    await settle();
    const note = screen.getByTestId('immich-permission-note');
    expect(note.getAttribute('data-permission')).toBe('album.read');
    expect(document.querySelector('[data-ref="abc-2"]')).not.toBeNull();
  });

  it('keeps the window open with the reason when the copy fails', async () => {
    immichReady();
    routes.push((url) => (url === '/api/immich/albums' ? { body: [] } : undefined));
    routes.push((url) => (url.startsWith('/api/photo-source/browse') ? { body: { items: [{ ref: 'abc-3', thumbUrl: '/t/3.jpg' }], nextPage: null } } : undefined));
    routes.push((url) => (url === '/api/photo-source/import' ? { status: 415, body: { error: "This picture is in a format the display can't show. Try a different one." } } : undefined));
    const onClose = vi.fn();
    render(wrap(<PicturePicker mode="pick-image" onClose={onClose} />));
    await settle();
    fireEvent.click(screen.getByTestId('picker-tab-immich'));
    await settle();
    fireEvent.click(document.querySelector('[data-ref="abc-3"]')!);
    await act(async () => { fireEvent.click(screen.getByTestId('picker-confirm')); });
    await settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('picker-hint').textContent).toBe("This picture is in a format the display can't show. Try a different one.");
  });

  it('says how to get favorites when there are none', async () => {
    immichReady();
    routes.push((url) => (url === '/api/immich/albums' ? { body: [] } : undefined));
    routes.push((url) => (url.startsWith('/api/photo-source/browse') ? { body: { items: [], nextPage: null } } : undefined));
    render(wrap(<PicturePicker mode="pick-image" onClose={() => {}} />));
    await settle();
    fireEvent.click(screen.getByTestId('picker-tab-immich'));
    await settle();
    fireEvent.click(screen.getByTestId('immich-collection-favorites'));
    await settle();
    expect(screen.getByText(/No favorites yet/)).toBeTruthy();
  });
});

describe('PicturePicker Unsplash tab', () => {
  it('searches an idea in English, names the photographer, and copies on Select Image', async () => {
    secrets.status = { unsplash_access_key: true };
    routes.push((url) => (url.startsWith('/api/photo-source/browse')
      ? { body: { items: [{ ref: 'u1', thumbUrl: '/t/u1.jpg', credit: { name: 'Ana Ruiz' } }], nextPage: 2 } }
      : undefined));
    routes.push((url) => (url === '/api/photo-source/import' ? { status: 201, body: { path: '/api/backgrounds/serve?file=unsplash%2Funsplash-u1.jpg' } } : undefined));
    const onSelectImage = vi.fn();
    render(wrap(<PicturePicker mode="pick-image" orientation="portrait" onSelectImage={onSelectImage} onClose={() => {}} />));
    await settle();
    fireEvent.click(screen.getByTestId('picker-tab-unsplash'));
    await settle();
    fireEvent.click(screen.getByTestId('unsplash-idea-ocean'));
    await settle();
    expect(calls.some((c) => c.url === '/api/photo-source/browse?kind=unsplash&collection=search&page=1&query=ocean+sea+coast&orientation=portrait')).toBe(true);
    fireEvent.click(document.querySelector('[data-ref="u1"]')!);
    expect(screen.getByTestId('picker-hint').textContent).toBe("Photo by Ana Ruiz on Unsplash. A copy goes into your library's Unsplash folder.");
    // Show more asks for the next page.
    fireEvent.click(screen.getByText('Show more'));
    await settle();
    expect(calls.some((c) => c.url.includes('kind=unsplash') && c.url.includes('page=2'))).toBe(true);
    await act(async () => { fireEvent.click(screen.getByTestId('picker-confirm')); });
    await settle();
    expect(onSelectImage).toHaveBeenCalledWith('/api/backgrounds/serve?file=unsplash%2Funsplash-u1.jpg');
  });
});

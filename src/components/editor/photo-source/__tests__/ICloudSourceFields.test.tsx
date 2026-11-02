// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { displayCache } from '@/lib/display-cache';
import enUSEditor from '@/translations/en-US/editor.json';

const editorFetch = vi.fn();
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => editorFetch(...args),
  isSessionExpired: () => false,
}));

import { ICloudSourceFields } from '../ICloudSourceFields';

const ALBUM_LINK = 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC';
const PHOTO_LINK = 'https://share.icloud.com/photos/0f0a3hdUxHZ0-C8uQ7Dq1JxLw';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{children}</I18nProvider>;
}

function renderSection(albumUrl: string) {
  const set = vi.fn();
  const view = render(
    <ICloudSourceFields source={{ kind: 'icloud', albumUrl }} onChange={set} />,
    { wrapper: Wrapper },
  );
  return { set, view };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.useFakeTimers();
  editorFetch.mockReset();
  displayCache.clear();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('ICloudSourceFields wrong-link bridge', () => {
  it('shows the album preview strip (no bridge) for a Shared Album link', async () => {
    editorFetch.mockResolvedValue(jsonResponse([{ url: 'data:image/gif;base64,AAA', type: 'image' }]));

    const { view } = renderSection(ALBUM_LINK);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(view.queryByText(/This is a photo link/)).toBeNull();
    expect(view.container.querySelectorAll('img')).toHaveLength(1);
    const previewUrl = String(editorFetch.mock.calls[0][0]);
    expect(previewUrl).toContain('/api/photo-source/media?kind=icloud&link=');
  });

  it('says it is checking an album link, then that it found nothing when Apple refuses it', async () => {
    let refuse: (r: Response) => void = () => {};
    editorFetch.mockImplementation(() => new Promise<Response>((resolve) => { refuse = resolve; }));

    const { view } = renderSection(ALBUM_LINK);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(view.getByTestId('icloud-checking')).toBeTruthy();

    await act(async () => { refuse(jsonResponse({ error: 'Failed to load photos' }, 500)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(view.queryByTestId('icloud-checking')).toBeNull();
    expect(view.getByText(/Nothing found yet\. Check the link/)).toBeTruthy();
  });

  it('offers Save to library instead of silence for a pasted photo link', () => {
    const { view } = renderSection(PHOTO_LINK);

    expect(view.getByText(/This is a photo link/)).toBeTruthy();
    expect(view.getByText('Save to library')).toBeTruthy();
    // No preview fetch is attempted for a link that can never play live.
    expect(editorFetch).not.toHaveBeenCalled();
  });

  it('imports the photo link and flips the module to the saved local folder', async () => {
    editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ jobId: 'job-1', total: 4 }, 202);
      if (String(url).includes('jobId=job-1')) {
        return jsonResponse({ state: 'done', total: 4, done: 4, skipped: 0, failed: 0 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { set, view } = renderSection(PHOTO_LINK);
    fireEvent.click(view.getByText('Save to library'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });   // POST resolves
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); // first poll → done

    const postBody = JSON.parse((editorFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(postBody).toEqual({ url: PHOTO_LINK, folder: 'icloud-imports' });
    expect(set).toHaveBeenCalledWith({ kind: 'library', folder: 'icloud-imports' });
  });

  it('invalidates cached backgrounds lists when the import completes, so canvas modules reload', async () => {
    // A module preview on the canvas holds a fresh-cached (empty) list —
    // exactly the state that used to show "No photos" until a page refresh.
    displayCache.set('/api/photo-source/media?kind=library&folder=icloud-imports', [], 600_000);
    const invalidated: string[] = [];
    const onInvalidate = (e: Event) => invalidated.push((e as CustomEvent).detail as string);
    window.addEventListener('displaycache:invalidate', onInvalidate);

    editorFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ jobId: 'job-3', total: 1 }, 202);
      return jsonResponse({ state: 'done', total: 1, done: 1, skipped: 0, failed: 0 });
    });

    const { view } = renderSection(PHOTO_LINK);
    fireEvent.click(view.getByText('Save to library'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    window.removeEventListener('displaycache:invalidate', onInvalidate);
    expect(displayCache.get('/api/photo-source/media?kind=library&folder=icloud-imports')).toBeNull();
    expect(invalidated).toContain('/api/photo-source/media?kind=library&folder=icloud-imports');
  });

  it('shows the expired message and does not flip when the link is dead', async () => {
    editorFetch.mockResolvedValue(jsonResponse({ error: 'link-expired' }, 400));

    const { set, view } = renderSection(PHOTO_LINK);
    fireEvent.click(view.getByText('Save to library'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(view.getByText(/isn't working anymore/)).toBeTruthy();
    expect(set).not.toHaveBeenCalled();
  });

  it('does not flip when the import finishes with nothing saved', async () => {
    editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ jobId: 'job-2', total: 2 }, 202);
      return jsonResponse({ state: 'done', total: 2, done: 0, skipped: 0, failed: 2 });
    });

    const { set, view } = renderSection(PHOTO_LINK);
    fireEvent.click(view.getByText('Save to library'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(set).not.toHaveBeenCalled();
    expect(view.getByText(/Check the link/)).toBeTruthy();
  });
});

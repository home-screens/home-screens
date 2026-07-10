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

import ICloudImportPanel from '../ICloudImportPanel';

const ALBUM_LINK = 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC';
const PHOTO_LINK = 'https://share.icloud.com/photos/0f0a3hdUxHZ0-C8uQ7Dq1JxLw';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{children}</I18nProvider>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderOpenPanel(onImported = vi.fn(), selectedDir = 'family') {
  const view = render(
    <ICloudImportPanel selectedDir={selectedDir} onImported={onImported} />,
    { wrapper: Wrapper },
  );
  fireEvent.click(view.getByText('Import from an iCloud link'));
  return { view, onImported };
}

function typeUrl(view: ReturnType<typeof render>, url: string) {
  fireEvent.change(view.getByPlaceholderText('Paste an iCloud album or photo link'), {
    target: { value: url },
  });
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

describe('ICloudImportPanel', () => {
  it('shows the help text until something more specific applies', () => {
    const { view } = renderOpenPanel();
    expect(view.getByText(/Works with Shared Album links/)).toBeTruthy();
  });

  it('swaps the help for the live-album tip when a Shared Album link is pasted', () => {
    const { view } = renderOpenPanel();
    typeUrl(view, ALBUM_LINK);

    expect(view.getByText(/can also play live/)).toBeTruthy();
    expect(view.queryByText(/Works with Shared Album links/)).toBeNull();
  });

  it('imports into the selected folder, shows progress then the summary, and refreshes the caller', async () => {
    editorFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ jobId: 'job-1', total: 3 }, 202);
      return jsonResponse({ state: 'done', total: 3, done: 2, skipped: 1, failed: 0 });
    });
    const { view, onImported } = renderOpenPanel();
    typeUrl(view, PHOTO_LINK);

    fireEvent.click(view.getByText('Import'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // POST resolves

    const postBody = JSON.parse((editorFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(postBody).toEqual({ url: PHOTO_LINK, folder: 'family' });
    // Running state: progress line, no summary yet.
    expect(view.getByText('Downloading 0 of 3…')).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); // poll → done

    expect(view.getByText(/Added 2 new items\. 1 were already here\./)).toBeTruthy();
    expect(onImported).toHaveBeenCalledTimes(1);
    // The input clears so the next paste starts clean.
    expect((view.getByPlaceholderText('Paste an iCloud album or photo link') as HTMLInputElement).value).toBe('');
  });

  it('appends the failure count when some downloads failed', async () => {
    editorFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ jobId: 'job-2', total: 3 }, 202);
      return jsonResponse({ state: 'done', total: 3, done: 1, skipped: 0, failed: 2 });
    });
    const { view } = renderOpenPanel();
    typeUrl(view, PHOTO_LINK);

    fireEvent.click(view.getByText('Import'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(view.getByText(/2 couldn't be downloaded\./)).toBeTruthy();
  });

  it('shows the error message instead of the help when the start is rejected', async () => {
    editorFetch.mockResolvedValue(jsonResponse({ error: 'busy' }, 409));
    const { view, onImported } = renderOpenPanel();
    typeUrl(view, PHOTO_LINK);

    fireEvent.click(view.getByText('Import'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(view.getByText(/Another import is already running/)).toBeTruthy();
    expect(view.queryByText(/Works with Shared Album links/)).toBeNull();
    expect(onImported).not.toHaveBeenCalled();
  });
});

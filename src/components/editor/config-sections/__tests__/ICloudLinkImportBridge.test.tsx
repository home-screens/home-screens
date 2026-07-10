// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { displayCache } from '@/lib/display-cache';
import type { ICloudImportJobStatus } from '@/hooks/useICloudImport';
import enUSEditor from '@/translations/en-US/editor.json';

const editorFetch = vi.fn();
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => editorFetch(...args),
  isSessionExpired: () => false,
}));

import { ICloudLinkImportBridge, ICLOUD_IMPORT_FOLDER } from '../ICloudLinkImportBridge';

const PHOTO_LINK = 'https://share.icloud.com/photos/0f0a3hdUxHZ0-C8uQ7Dq1JxLw';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{children}</I18nProvider>;
}

/** Render the bridge with the video module's props — the config it ships with. */
function renderVideoBridge(onSaved: (job: ICloudImportJobStatus) => void) {
  return render(
    <ICloudLinkImportBridge
      url={PHOTO_LINK}
      introKey="configSections.video.icloudLinkDetected"
      noItemsKey="configSections.video.icloudNoVideos"
      savedSomething={(job) => (job.videoFiles ?? []).length > 0}
      onSaved={onSaved}
    />,
    { wrapper: Wrapper },
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function importResponses(finalJob: Record<string, unknown>) {
  editorFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return jsonResponse({ jobId: 'job-1', total: 1 }, 202);
    return jsonResponse({ state: 'done', total: 1, done: 1, skipped: 0, failed: 0, ...finalJob });
  });
}

async function clickSaveAndFinish(view: ReturnType<typeof render>) {
  fireEvent.click(view.getByText('Save to library'));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });   // POST resolves
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); // poll → done
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

describe('ICloudLinkImportBridge', () => {
  it('explains the link and offers Save to library', () => {
    const view = renderVideoBridge(vi.fn());
    expect(view.getByText(/can't play directly/)).toBeTruthy();
    expect(view.getByText('Save to library')).toBeTruthy();
  });

  it('imports into the shared import folder and hands back the finished job', async () => {
    importResponses({ videoFiles: ['icloud-imports/IMG_0333-AXaxFKq1.mp4'] });
    const onSaved = vi.fn();

    const view = renderVideoBridge(onSaved);
    await clickSaveAndFinish(view);

    const postBody = JSON.parse((editorFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(postBody).toEqual({ url: PHOTO_LINK, folder: ICLOUD_IMPORT_FOLDER });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'done', videoFiles: ['icloud-imports/IMG_0333-AXaxFKq1.mp4'] }),
    );
  });

  it('shows the no-items message when the job saved nothing useful', async () => {
    importResponses({ videoFiles: [] });
    const onSaved = vi.fn();

    const view = renderVideoBridge(onSaved);
    await clickSaveAndFinish(view);

    expect(view.getByText(/doesn't have any videos/)).toBeTruthy();
    // onSaved still fires — the caller decides what an empty result means.
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ videoFiles: [] }));
  });

  it('shows the expired message without calling onSaved', async () => {
    editorFetch.mockResolvedValue(jsonResponse({ error: 'link-expired' }, 400));
    const onSaved = vi.fn();

    const view = renderVideoBridge(onSaved);
    fireEvent.click(view.getByText('Save to library'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(view.getByText(/isn't working anymore/)).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

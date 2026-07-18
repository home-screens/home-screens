// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { displayCache } from '@/lib/display-cache';
import type { ModuleInstance } from '@/types/config';
import enUSEditor from '@/translations/en-US/editor.json';

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

vi.mock('@/components/editor/ImageBrowserModal', () => ({
  default: ({ initialDirectory }: { initialDirectory?: string }) => (
    <div data-testid="image-browser" data-directory={initialDirectory ?? ''} />
  ),
}));

import { VideoConfigSection } from '../VideoConfigSection';

const PHOTO_LINK = 'https://share.icloud.com/photos/0f0a3hdUxHZ0-C8uQ7Dq1JxLw';

const mod = { id: 'm1', type: 'video' } as ModuleInstance;

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{children}</I18nProvider>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Wire the import POST + poll to finish with the given videoFiles. */
function importFinishingWith(videoFiles: string[]) {
  editorFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return jsonResponse({ jobId: 'job-1', total: videoFiles.length }, 202);
    return jsonResponse({
      state: 'done', total: videoFiles.length, done: videoFiles.length, skipped: 0, failed: 0, videoFiles,
    });
  });
}

async function saveFromBridge(view: ReturnType<typeof render>) {
  fireEvent.click(view.getByText('Save to library'));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });   // POST resolves
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); // poll → done
}

beforeEach(() => {
  vi.useFakeTimers();
  editorFetch.mockReset();
  moduleState.set.mockReset();
  moduleState.config = { source: 'url', url: PHOTO_LINK };
  displayCache.clear();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('VideoConfigSection — iCloud link auto-select after import', () => {
  it('shows the bridge instead of the URL hint when an iCloud link is pasted', () => {
    const view = render(<VideoConfigSection mod={mod} screenId="s1" />, { wrapper: Wrapper });
    expect(view.getByText(/can't play directly/)).toBeTruthy();
  });

  it('wires a single imported clip straight into the module', async () => {
    importFinishingWith(['icloud-imports/IMG_0333-AXaxFKq1.mp4']);

    const view = render(<VideoConfigSection mod={mod} screenId="s1" />, { wrapper: Wrapper });
    await saveFromBridge(view);

    expect(moduleState.set).toHaveBeenCalledWith({
      source: 'file',
      file: 'icloud-imports/IMG_0333-AXaxFKq1.mp4',
      url: undefined,
    });
    expect(view.queryByTestId('image-browser')).toBeNull();
  });

  it('opens the library browser at the import folder when several clips were saved', async () => {
    importFinishingWith(['icloud-imports/a.mp4', 'icloud-imports/b.mp4']);

    const view = render(<VideoConfigSection mod={mod} screenId="s1" />, { wrapper: Wrapper });
    await saveFromBridge(view);

    expect(moduleState.set).toHaveBeenCalledWith({ source: 'file', url: undefined });
    const browser = view.getByTestId('image-browser');
    expect(browser.getAttribute('data-directory')).toBe('icloud-imports');
  });

  it('changes nothing when the link held no videos', async () => {
    importFinishingWith([]);

    const view = render(<VideoConfigSection mod={mod} screenId="s1" />, { wrapper: Wrapper });
    await saveFromBridge(view);

    expect(moduleState.set).not.toHaveBeenCalled();
    expect(view.queryByTestId('image-browser')).toBeNull();
    // The bridge explains why nothing happened.
    expect(view.getByText(/doesn't have any videos/)).toBeTruthy();
  });
});

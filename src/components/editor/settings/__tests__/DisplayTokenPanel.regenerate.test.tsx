// @vitest-environment jsdom

/**
 * "Make a new key" says how many walls the changeover let in by themselves.
 *
 * A new key does not take those walls out: they hold cookies of their own.
 * So a grown-up making a new key because the old one got around is told how
 * many there are and pointed at the list where they can check and remove
 * them. With none, the warning is what it was.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import type { WallApiEntry, WallsApiResponse } from '@/lib/walls-api-types';

const mocks = vi.hoisted(() => ({
  displayFetch: vi.fn(),
  editorFetch: vi.fn(),
  walls: [] as unknown[],
  storeState: { config: { displays: undefined } } as {
    config: { displays?: { id: string; name: string; screens: [] }[] };
  },
}));

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: (...args: unknown[]) => mocks.displayFetch(...args),
}));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
}));
vi.mock('@/stores/editor-store', () => {
  const useEditorStore = (selector?: (state: unknown) => unknown) =>
    (selector ? selector(mocks.storeState) : mocks.storeState);
  useEditorStore.getState = () => mocks.storeState;
  return { useEditorStore };
});

import DisplayTokenPanel from '../SecuritySection/DisplayTokenPanel';
import { I18nProvider } from '@/i18n/provider';
import { __resetOriginForTests } from '@/hooks/useOrigin';
import enUSEditor from '@/translations/en-US/editor.json';

let nextId = 0;
function wall(over: Partial<WallApiEntry> = {}): WallApiEntry {
  nextId += 1;
  return {
    id: `wall-${nextId}`,
    status: 'in',
    displayId: null,
    address: `192.168.1.${50 + nextId}`,
    userAgent: 'Mozilla/5.0 (X11; Linux aarch64) Chromium/120',
    viewport: { width: 1080, height: 1920 },
    lastSeenAt: Date.now(),
    createdAt: Date.now(),
    letInByItself: false,
    hubScreen: false,
    looksFamiliar: false,
    ...over,
  };
}

const wallsAsked = () => mocks.editorFetch.mock.calls.filter(([url]) => url === '/api/display/walls').length;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  __resetOriginForTests();
  nextId = 0;
  mocks.walls = [];
  mocks.storeState.config = { displays: undefined };
  mocks.displayFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ origin: 'http://home-screens.local:3000' }),
  });
  mocks.editorFetch.mockImplementation(async (url: string) => {
    if (url === '/api/display/walls') {
      const body: WallsApiResponse = { passwordSet: true, windowOpen: true, windowEndsAt: Date.now() + 86_400_000, showingCount: mocks.walls.length, walls: mocks.walls as WallApiEntry[] };
      return { ok: true, json: async () => body };
    }
    return { ok: false, json: async () => ({}) };
  });
});

function renderPanel() {
  return render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      <DisplayTokenPanel token="secret-display-key" onTokenChange={() => {}} passwordOn lastRefused={null} />
    </I18nProvider>,
  );
}

const WARNING = 'Anything using the old key stops working until you give it the new one. Your displays keep working.';

async function openWarning() {
  const view = renderPanel();
  fireEvent.click(view.getByRole('button', { name: 'Make a new key' }));
  await waitFor(() => expect(wallsAsked()).toBeGreaterThan(0));
  return view;
}

describe('the make-a-new-key warning', () => {
  it('asks about walls only once the warning is open', async () => {
    renderPanel();
    await new Promise((r) => setTimeout(r, 20));
    expect(wallsAsked()).toBe(0);
  });

  it('stays as it was when no wall was let in by itself', async () => {
    mocks.walls = [wall({ letInByItself: false }), wall({ hubScreen: true })];
    const { getByText, queryByTestId } = await openWarning();

    // Let the answer land before checking nothing was added.
    await new Promise((r) => setTimeout(r, 20));
    expect(getByText(WARNING)).toBeTruthy();
    expect(queryByTestId('regenerate-walls-let-in-by-themselves')).toBeNull();
  });

  it('says how many walls were let in by themselves and links to the list', async () => {
    mocks.walls = [
      wall({ letInByItself: true }),
      wall({ letInByItself: true }),
      // Let in by a click, and one still waiting: neither is counted.
      wall({ letInByItself: false }),
      wall({ status: 'waiting' }),
    ];
    const { findByTestId } = await openWarning();

    const line = await findByTestId('regenerate-walls-let-in-by-themselves');
    expect(line.textContent?.trim()).toBe(
      "2 browsers were let in by themselves after the update. A new key doesn't remove them. Check they're yours",
    );
    // A hub with one display lists its walls on Settings > Displays.
    expect(line.querySelector('a')?.getAttribute('href')).toBe('/editor/settings?section=displays');
  });

  it('says it once for a single wall', async () => {
    mocks.walls = [wall({ letInByItself: true })];
    const { findByTestId } = await openWarning();

    const line = await findByTestId('regenerate-walls-let-in-by-themselves');
    expect(line.textContent?.trim()).toBe(
      "1 browser was let in by itself after the update. A new key doesn't remove it. Check it's yours",
    );
  });

  it('goes straight to the display when they all show on one', async () => {
    mocks.storeState.config = {
      displays: [
        { id: 'main', name: 'Kitchen', screens: [] },
        { id: 'playroom', name: 'Playroom', screens: [] },
      ],
    };
    mocks.walls = [
      wall({ letInByItself: true, displayId: 'playroom' }),
      wall({ letInByItself: true, displayId: 'playroom' }),
      wall({ letInByItself: false, displayId: 'main' }),
    ];
    const { findByTestId } = await openWarning();

    const link = (await findByTestId('regenerate-walls-let-in-by-themselves')).querySelector('a');
    expect(link?.getAttribute('href')).toBe('/editor/settings?section=display&id=playroom&subtab=overview');
  });

  it('counts a wall that names no display as the main display', async () => {
    mocks.storeState.config = {
      displays: [
        { id: 'main', name: 'Kitchen', screens: [] },
        { id: 'playroom', name: 'Playroom', screens: [] },
      ],
    };
    mocks.walls = [wall({ letInByItself: true, displayId: null }), wall({ letInByItself: true, displayId: 'main' })];
    const { findByTestId } = await openWarning();

    const link = (await findByTestId('regenerate-walls-let-in-by-themselves')).querySelector('a');
    expect(link?.getAttribute('href')).toBe('/editor/settings?section=display&id=main&subtab=overview');
  });

  it('goes to every display when they show on more than one', async () => {
    mocks.storeState.config = {
      displays: [
        { id: 'main', name: 'Kitchen', screens: [] },
        { id: 'playroom', name: 'Playroom', screens: [] },
      ],
    };
    mocks.walls = [wall({ letInByItself: true, displayId: 'main' }), wall({ letInByItself: true, displayId: 'playroom' })];
    const { findByTestId } = await openWarning();

    const link = (await findByTestId('regenerate-walls-let-in-by-themselves')).querySelector('a');
    expect(link?.getAttribute('href')).toBe('/editor/settings?section=displays');
  });
});

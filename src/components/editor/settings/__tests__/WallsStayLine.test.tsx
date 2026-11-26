// @vitest-environment jsdom

/**
 * Changing the password and "Sign everyone out" sign people out, not the
 * wall. Both say so, with a link to where the let-in browsers are listed,
 * and the 30-day note on Settings > Displays links to the displays whose own
 * pages hold the rows it talks about.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import type { WallApiEntry, WallsApiResponse } from '@/lib/walls-api-types';

const mocks = vi.hoisted(() => ({
  editorFetch: vi.fn(),
  walls: [] as unknown[],
  storeState: { config: { displays: undefined } } as {
    config: { displays?: { id: string; name: string; screens: [] }[] };
  },
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

import SessionRevocation from '../SecuritySection/SessionRevocation';
import { WindowWallsNotice } from '../display/WallsPanels';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';

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
    comesBack: false,
    looksFamiliar: false,
    ...over,
  };
}

const answer = (): WallsApiResponse => ({ passwordSet: true, windowOpen: true, windowEndsAt: Date.now() + 5 * 86_400_000, showingCount: mocks.walls.length, walls: mocks.walls as WallApiEntry[] });

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  nextId = 0;
  mocks.walls = [];
  mocks.storeState.config = { displays: undefined };
  mocks.editorFetch.mockImplementation(async (url: string) => (url === '/api/display/walls'
    ? { ok: true, json: async () => answer() }
    : { ok: false, json: async () => ({}) }));
});

const wrap = (node: React.ReactNode) => render(<I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>{node}</I18nProvider>);

describe('"Sign everyone out" and the wall', () => {
  async function openWarning() {
    const view = wrap(<SessionRevocation />);
    fireEvent.click(view.getByRole('button', { name: 'Sign everyone out' }));
    return view;
  }

  it('says the displays stay let in and links to the one display they show on', async () => {
    mocks.storeState.config = { displays: [{ id: 'main', name: 'Kitchen', screens: [] }, { id: 'hall', name: 'Hallway', screens: [] }] };
    mocks.walls = [wall({ displayId: 'hall' }), wall({ displayId: 'hall' }), wall({ status: 'waiting', displayId: 'main' })];
    const { findByTestId } = await openWarning();

    const line = await findByTestId('revoke-sessions-walls');
    expect(line.textContent).toBe('Your displays stay let in. See the list');
    expect(line.querySelector('a')?.getAttribute('href')).toBe('/editor/settings?section=display&id=hall&subtab=overview');
  });

  it('links to every display when they show on more than one, and counts one as one', async () => {
    mocks.storeState.config = { displays: [{ id: 'main', name: 'Kitchen', screens: [] }, { id: 'hall', name: 'Hallway', screens: [] }] };
    mocks.walls = [wall({ displayId: 'hall' }), wall({ displayId: 'main' })];
    const first = await openWarning();
    expect((await first.findByTestId('revoke-sessions-walls')).querySelector('a')?.getAttribute('href')).toBe('/editor/settings?section=displays');

    cleanup();
    mocks.storeState.config = { displays: undefined };
    mocks.walls = [wall()];
    const second = await openWarning();
    expect((await second.findByTestId('revoke-sessions-walls')).textContent).toBe('Your display stays let in. See the list');
  });

  it('says nothing about displays while no browser has been let in', async () => {
    mocks.walls = [wall({ status: 'waiting' })];
    const { queryByTestId, getByText } = await openWarning();
    await new Promise((r) => setTimeout(r, 20));
    expect(getByText('Everyone signed in gets signed out, including you on this device.')).toBeTruthy();
    expect(queryByTestId('revoke-sessions-walls')).toBeNull();
  });
});

describe('the 30-day note', () => {
  it('links to each display whose page lists a browser let in by itself', () => {
    mocks.walls = [wall({ letInByItself: true, displayId: 'hall' })];
    const { getByTestId } = wrap(
      <WindowWallsNotice data={answer()} places={[{ id: 'hall', name: 'Hallway', href: '?display=hall&subtab=overview' }]} />,
    );
    const where = getByTestId('window-walls-places');
    expect(where.textContent).toBe("You'll find them on these displays: Hallway");
    expect(where.querySelector('a')?.getAttribute('href')).toBe('?display=hall&subtab=overview');
  });

  it('adds no line where the list is on the same page', () => {
    mocks.walls = [wall({ letInByItself: true })];
    const { queryByTestId, getByTestId } = wrap(<WindowWallsNotice data={answer()} places={[]} />);
    expect(getByTestId('window-walls')).toBeTruthy();
    expect(queryByTestId('window-walls-places')).toBeNull();
  });
});

// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import type { PhotoSource, Screen, ScreenConfiguration } from '@/types/config';

const editorFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editor-fetch', () => ({ editorFetch, isSessionExpired: () => false, sessionExpired: () => new Error('expired') }));
const secrets = vi.hoisted(() => ({ status: {} as Record<string, boolean> }));
vi.mock('@/hooks/useSecretStatus', () => ({
  useSecretStatus: () => ({ status: secrets.status, loading: false, error: false, hasStatus: true, refetch: () => {} }),
}));
const store = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));
vi.mock('@/stores/editor-store', () => ({
  useEditorStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => (selector ? selector(store.state) : store.state),
    { getState: () => store.state },
  ),
}));

import BackgroundPicker from '../BackgroundPicker';

const updateScreenRotation = vi.fn();

function seed(sources: PhotoSource[] = [], backgroundImage = '') {
  const screen: Screen = { id: 's1', name: 'Hall', backgroundImage, modules: [], backgroundRotation: { intervalMinutes: 60, sources } };
  const config = { version: 18, screens: [screen], settings: {} } as unknown as ScreenConfiguration;
  store.state = {
    config,
    selectedDisplayId: null,
    selectedScreenId: 's1',
    updateScreen: vi.fn(),
    updateScreenRotation,
    pickScreenBackground: vi.fn(),
    updateScreenShade: vi.fn(),
    updateScreenEffects: vi.fn(),
  };
}

beforeEach(() => {
  secrets.status = {};
  updateScreenRotation.mockReset();
  editorFetch.mockReset();
  editorFetch.mockImplementation(async () => ({ ok: true, status: 200, json: async () => [], headers: new Headers() }));
});
afterEach(cleanup);

const wrap = (ui: React.ReactElement) => <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{ui}</I18nProvider>;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const rowCheckbox = (id: string) => screen.getByTestId(`source-row-${id}`).querySelector('input[type=checkbox]') as HTMLInputElement;

describe('BackgroundPicker', () => {
  it('lists the two wall groups and one row per kind a background can draw from', async () => {
    seed();
    render(wrap(<BackgroundPicker />));
    await settle();
    for (const id of ['color', 'pattern', 'library', 'immich', 'icloud', 'onedrive', 'unsplash', 'nasa']) {
      expect(screen.getByTestId(`source-row-${id}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('source-row-wall')).toBeNull();
  });

  it('ticking a row adds that kind with a fresh source, and unticking takes it out', async () => {
    seed();
    render(wrap(<BackgroundPicker />));
    await settle();
    fireEvent.click(rowCheckbox('nasa'));
    // NASA has one new picture a day, so ticking it also slows the rotation to four hours.
    expect(updateScreenRotation).toHaveBeenCalledWith('s1', { source: { kind: 'nasa' }, intervalMinutes: 240 });

    cleanup();
    seed([{ kind: 'nasa' }]);
    render(wrap(<BackgroundPicker />));
    await settle();
    expect(rowCheckbox('nasa').checked).toBe(true);
    fireEvent.click(rowCheckbox('nasa'));
    expect(updateScreenRotation).toHaveBeenCalledWith('s1', { remove: { kind: 'nasa' } });
  });

  it('a kind without its key cannot be ticked and points at Settings', async () => {
    seed();
    render(wrap(<BackgroundPicker />));
    await settle();
    expect(rowCheckbox('unsplash').disabled).toBe(true);
    expect(rowCheckbox('immich').disabled).toBe(true);
    expect(screen.getByTestId('source-note-unsplash').textContent).toContain('Set up');
    expect(screen.getByTestId('integration-settings-link-unsplash')).toBeTruthy();
    // No key needed for the library, iCloud or NASA.
    expect(rowCheckbox('library').disabled).toBe(false);
    expect(rowCheckbox('icloud').disabled).toBe(false);
    expect(rowCheckbox('nasa').disabled).toBe(false);
  });

  it('says Fixed, then one picture, then Rotating as the walls add up, and offers Refresh and the interval accordingly', async () => {
    seed();
    render(wrap(<BackgroundPicker />));
    await settle();
    expect(screen.getByTestId('background-mode').textContent).toContain('Fixed background');
    expect((screen.getByTestId('background-rotation-refresh') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('background-rotate-every')).toBeNull();

    cleanup();
    seed([{ kind: 'wall', group: 'color', ids: ['ocean'] }]);
    render(wrap(<BackgroundPicker />));
    await settle();
    expect(screen.getByTestId('background-mode').textContent).toContain('Showing one picture');
    expect((screen.getByTestId('background-rotation-refresh') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('background-rotate-every')).toBeNull();

    cleanup();
    seed([{ kind: 'wall', group: 'color', ids: ['ocean', 'dusk'] }]);
    render(wrap(<BackgroundPicker />));
    await settle();
    expect(screen.getByTestId('background-mode').textContent).toContain('Rotating between the selected sources');
    expect(screen.getByTestId('background-rotate-every')).toBeTruthy();
  });

  it('a ticked source that names nothing yet says what it needs and does not count as rotating', async () => {
    seed([{ kind: 'wall', group: 'color', ids: [] }, { kind: 'icloud', albumUrl: '' }]);
    render(wrap(<BackgroundPicker />));
    await settle();
    expect(screen.getByTestId('source-note-color').textContent).toContain('Click the walls');
    expect(screen.getByTestId('source-note-icloud').textContent).toContain('Paste the album link');
    expect(screen.getByTestId('background-mode').textContent).toContain('Fixed background');
  });

  it('something typed that is not an album link says so, not "paste the link first"', async () => {
    seed([{ kind: 'icloud', albumUrl: 'not a link' }]);
    render(wrap(<BackgroundPicker />));
    await settle();
    expect(screen.getByTestId('source-note-icloud').textContent).toBe("That doesn't look like a shared album link");
  });

  it('a source unticked and ticked again comes back as it was set', async () => {
    const walls: PhotoSource = { kind: 'wall', group: 'color', ids: ['ocean', 'dusk', 'plum'] };
    const album: PhotoSource = { kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#B0abc123' };
    seed([walls, album]);
    render(wrap(<BackgroundPicker />));
    await settle();
    fireEvent.click(rowCheckbox('color'));
    fireEvent.click(rowCheckbox('icloud'));
    expect(updateScreenRotation).toHaveBeenCalledWith('s1', { remove: { kind: 'wall', group: 'color' } });
    expect(updateScreenRotation).toHaveBeenCalledWith('s1', { remove: { kind: 'icloud' } });

    // The store has taken both out; ticking them again restores what they held.
    cleanup();
    seed([]);
    render(wrap(<BackgroundPicker />));
    await settle();
    fireEvent.click(rowCheckbox('color'));
    expect(updateScreenRotation).toHaveBeenLastCalledWith('s1', { source: walls });
    fireEvent.click(rowCheckbox('icloud'));
    expect(updateScreenRotation).toHaveBeenLastCalledWith('s1', { source: album });
    // A group never unticked on this screen starts empty.
    fireEvent.click(rowCheckbox('pattern'));
    expect(updateScreenRotation).toHaveBeenLastCalledWith('s1', { source: { kind: 'wall', group: 'pattern', ids: [] } });
  });

  it('says NASA has one picture a day when the pace is faster than that is worth', async () => {
    seed([{ kind: 'nasa' }, { kind: 'wall', group: 'color', ids: ['ocean', 'dusk'] }]);
    render(wrap(<BackgroundPicker />));
    await settle();
    expect(screen.getByTestId('background-nasa-pace').textContent).toContain('one new picture a day');

    cleanup();
    seed([{ kind: 'wall', group: 'color', ids: ['ocean', 'dusk'] }]);
    render(wrap(<BackgroundPicker />));
    await settle();
    expect(screen.queryByTestId('background-nasa-pace')).toBeNull();
  });

  it('a refresh that lands on the picture already up says there is only one, and an edit takes the note down', async () => {
    seed([{ kind: 'wall', group: 'color', ids: ['ocean'] }]);
    editorFetch.mockImplementation(async (url: string) => ({
      ok: true, status: 200, headers: new Headers(),
      json: async () => (String(url).startsWith('/api/backgrounds/rotate') ? { path: '/starter-backgrounds/ocean.svg', fresh: false, same: true } : []),
    }));
    const { rerender } = render(wrap(<BackgroundPicker />));
    await settle();
    fireEvent.click(screen.getByTestId('background-rotation-refresh'));
    await settle();
    expect(screen.getByTestId('background-refresh-result').textContent).toBe('Only one picture to show');

    seed([{ kind: 'wall', group: 'color', ids: ['ocean', 'dusk'] }]);
    rerender(wrap(<BackgroundPicker />));
    await settle();
    expect(screen.queryByTestId('background-refresh-result')).toBeNull();
  });

  it('names a leftover rotation download as the last rotating picture, not by its file name', async () => {
    seed([], '/api/backgrounds/serve?file=rotation-unsplash-EqQFaL5imFQ.jpg');
    render(wrap(<BackgroundPicker />));
    await settle();
    expect(screen.getByTestId('background-picture-name').textContent).toBe('Last rotating picture');
  });

  it('the wall tiles toggle the group\'s picks through the rotation action', async () => {
    seed([{ kind: 'wall', group: 'color', ids: ['ocean'] }]);
    render(wrap(<BackgroundPicker />));
    await settle();
    fireEvent.click(screen.getByTestId('starter-background-dusk'));
    expect(updateScreenRotation).toHaveBeenCalledWith('s1', { source: { kind: 'wall', group: 'color', ids: ['ocean', 'dusk'] } });
    fireEvent.click(screen.getByTestId('starter-background-ocean'));
    expect(updateScreenRotation).toHaveBeenCalledWith('s1', { source: { kind: 'wall', group: 'color', ids: [] } });
  });
});

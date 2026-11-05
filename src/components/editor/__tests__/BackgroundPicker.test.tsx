// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ScreenConfiguration } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import { useEditorStore } from '@/stores/editor-store';
import enUSEditor from '@/translations/en-US/editor.json';
import BackgroundPicker from '../BackgroundPicker';

// The checklist needs every source's key status; stub it so `icloud` and
// `local` (no key required) sit alongside a `false` for the keyed ones —
// exercising the checklist without pulling in a real /api/secrets round trip.
const secrets = vi.hoisted(() => ({ immich: false }));
vi.mock('@/hooks/useSecretStatus', () => ({
  useSecretStatus: () => ({
    status: { unsplash_access_key: true, nasa_api_key: false, immich_api_key: secrets.immich, immich_url: secrets.immich },
    loading: false,
    error: false,
    hasStatus: true,
    refetch: () => {},
  }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      {children}
    </I18nProvider>
  );
}

function seedStore(backgroundRotation: ScreenConfiguration['screens'][number]['backgroundRotation'], backgroundImage = ''): void {
  const config: ScreenConfiguration = {
    version: 14,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: { provider: 'weatherapi', units: 'imperial' },
      calendar: { googleCalendarIds: [], icalSources: [], daysAhead: 7 },
    },
    screens: [{ id: 'screen-1', name: 'Screen 1', backgroundImage, modules: [], backgroundRotation }],
  };

  useEditorStore.setState({
    config,
    selectedDisplayId: null,
    selectedScreenId: 'screen-1',
  });
}

function currentRotation() {
  return useEditorStore.getState().config?.screens[0].backgroundRotation;
}

afterEach(() => {
  secrets.immich = false;
  cleanup();
  useEditorStore.setState({ config: null, selectedDisplayId: null, selectedScreenId: null });
});

describe('BackgroundPicker — sources group always visible (item 1/2)', () => {
  it('splits into three collapsible sections: theme, background sources, and background effects (shade + effects)', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    const titles = Array.from(container.querySelectorAll('button[class*="group"] > span.uppercase')).map((el) => el.textContent);
    expect(titles).toEqual([
      enUSEditor.backgroundPicker.groups.theme,
      enUSEditor.backgroundPicker.title,
      enUSEditor.backgroundPicker.effectsTitle,
    ]);
    const text = container.textContent ?? '';
    // Sources come before the effects section, which holds Shade and Effects.
    expect(text.indexOf(enUSEditor.backgroundPicker.sourcesGroup)).toBeLessThan(text.indexOf(enUSEditor.backgroundPicker.shadeGroup));
    expect(text.indexOf(enUSEditor.backgroundPicker.shadeGroup)).toBeLessThan(text.indexOf(enUSEditor.backgroundPicker.effectsGroup));
  });

  it('shows the Sources group and every source checkbox even with zero sources checked', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { container, getByText } = render(<BackgroundPicker />, { wrapper: Wrapper });

    expect(getByText(enUSEditor.backgroundPicker.sourcesGroup)).not.toBeNull();
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    // Two rotatable bundled groups (colors, patterns; themes are a single choice) plus five providers.
    expect(checkboxes).toHaveLength(7);
    expect(checkboxes.every((cb) => !cb.checked)).toBe(true);
  });

  it('the refresh button is disabled with zero sources and enabled once one is checked', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    const refreshBtn = container.querySelector('[data-testid="background-rotation-refresh"]') as HTMLButtonElement;
    expect(refreshBtn.disabled).toBe(true);

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const localCheckbox = checkboxes.find((cb) => cb.closest('label')?.textContent?.includes(enUSEditor.backgroundPicker.sources.local));
    fireEvent.click(localCheckbox!);

    expect(refreshBtn.disabled).toBe(false);
  });
});

describe('BackgroundPicker — multi-source rotation checklist', () => {
  it('checking a second source shows its settings block without touching the first', () => {
    seedStore({ enabled: true, sources: ['icloud'], query: '', intervalMinutes: 60, icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#existing' });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    // iCloud's settings (the album URL input) are already showing.
    const icloudInput = container.querySelector('input[type="url"]') as HTMLInputElement;
    expect(icloudInput).not.toBeNull();
    expect(icloudInput.value).toBe('https://www.icloud.com/sharedalbum/#existing');

    // Check the local-library checkbox too (unlocked, no key needed).
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const localCheckbox = checkboxes.find((cb) => cb.closest('label')?.textContent?.includes(enUSEditor.backgroundPicker.sources.local));
    expect(localCheckbox).toBeDefined();
    fireEvent.click(localCheckbox!);

    // Both sources are now checked, and iCloud's own field is untouched.
    const rotation = currentRotation();
    expect(rotation?.sources).toEqual(['icloud', 'local']);
    expect(rotation?.icloudAlbumUrl).toBe('https://www.icloud.com/sharedalbum/#existing');

    // The local folder picker's own block rendered too.
    expect(container.textContent).toContain(enUSEditor.backgroundPicker.local.folderLabel);
  });

  it('unchecking a source removes only that id from the array', () => {
    seedStore({
      enabled: true,
      sources: ['icloud', 'local'],
      query: '',
      intervalMinutes: 60,
      icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#keep',
      localFolder: 'vacation',
    });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const localCheckbox = checkboxes.find((cb) => cb.closest('label')?.textContent?.includes(enUSEditor.backgroundPicker.sources.local));
    expect(localCheckbox?.checked).toBe(true);
    fireEvent.click(localCheckbox!);

    const rotation = currentRotation();
    expect(rotation?.sources).toEqual(['icloud']);
    // The remaining source's own settings are untouched.
    expect(rotation?.icloudAlbumUrl).toBe('https://www.icloud.com/sharedalbum/#keep');
    // The removed source's setting value is preserved on the object even
    // though it's no longer shown — unchecking only edits `sources`.
    expect(rotation?.localFolder).toBe('vacation');
  });
});

describe('BackgroundPicker — Unsplash query/collections toggle', () => {
  it('switching to collections mode and back preserves both the query text and the collection rows', () => {
    seedStore({
      enabled: true,
      sources: ['unsplash'],
      query: 'space',
      intervalMinutes: 60,
    });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    // Starts in query mode with the existing query shown.
    const queryInput = () => container.querySelector('input[placeholder]') as HTMLInputElement | null;
    expect(queryInput()?.value).toBe('space');

    // Switch to collections mode and enter one collection id.
    const modeButtons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    const collectionsBtn = modeButtons.find((b) => b.textContent === enUSEditor.backgroundPicker.unsplash.modeCollections)!;
    fireEvent.click(collectionsBtn);

    let rotation = currentRotation();
    expect(rotation?.unsplashMode).toBe('collections');
    // The query text is still on the object even though its field isn't shown.
    expect(rotation?.query).toBe('space');

    const collectionInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(collectionInput, { target: { value: 'abc123' } });
    fireEvent.blur(collectionInput, { target: { value: 'abc123' } });

    rotation = currentRotation();
    expect(rotation?.unsplashCollections).toEqual(['abc123']);

    // Switch back to query mode: the collection just entered must NOT be
    // discarded, only hidden — this was the bug where the toggle nulled out
    // `unsplashCollections` whenever query mode was selected.
    const queryBtn = modeButtons.find((b) => b.textContent === enUSEditor.backgroundPicker.unsplash.modeQuery)!;
    fireEvent.click(queryBtn);

    rotation = currentRotation();
    expect(rotation?.unsplashMode).toBe('query');
    expect(rotation?.unsplashCollections).toEqual(['abc123']);
    expect(rotation?.query).toBe('space');
    expect(queryInput()?.value).toBe('space');
  });
});

describe('BackgroundPicker — shade color semantics', () => {
  it('color swatch writes an opaque shade color so visibility is controlled by strength, not embedded alpha', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    useEditorStore.getState().updateScreenShade('screen-1', {
      enabled: true,
      style: 'topBottom',
      strength: 60,
      color: 'rgba(26, 26, 26, 0)',
    } as never);

    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    const colorInputs = Array.from(container.querySelectorAll('input[type="color"]')) as HTMLInputElement[];
    const shadeColor = colorInputs[colorInputs.length - 1];
    fireEvent.change(shadeColor, { target: { value: '#112233' } });

    expect(useEditorStore.getState().config?.screens[0].shade?.color).toBe('#112233');
  });
});


describe('BackgroundPicker — unified Sources', () => {
  it('keeps themes outside Sources, with colors and patterns inside', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const headings = Array.from(container.querySelectorAll('h4')).map((h) => h.textContent);
    expect(headings).toEqual([
      enUSEditor.backgroundPicker.sourcesGroup,
      enUSEditor.backgroundPicker.shadeGroup,
      enUSEditor.backgroundPicker.effectsGroup,
    ]);
    const sources = container.querySelectorAll('h4')[0].parentElement!.parentElement!;
    expect(within(sources).queryByTestId('starter-source-theme')).toBeNull();
    expect(within(sources).queryByTestId('starter-background-theme-linen')).toBeNull();
    expect(container.querySelector('[data-testid="theme-backgrounds"] [data-testid="starter-background-theme-linen"]')).not.toBeNull();
    expect(within(sources).getByTestId('starter-source-color')).not.toBeNull();
    expect(within(sources).getByTestId('starter-source-pattern')).not.toBeNull();
    expect(within(sources).queryByRole('checkbox', { name: enUSEditor.backgroundPicker.groups.theme })).toBeNull();
    expect(container.querySelector('[data-testid^="background-tab-"]')).toBeNull();
    expect(container.textContent).not.toContain('Your own pictures');
    expect(container.textContent).not.toContain('Upload Background');
    // Only source-level toggles: no per-tile checkboxes.
    expect(sources.querySelectorAll('input[type="checkbox"]')).toHaveLength(7);
  });

  it('enabling a bundled group selects nothing; tiles then toggle by highlight, with no per-tile checkboxes', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 30 }, '/starter-backgrounds/ocean.svg');
    const { getByRole, getByTestId, getByText, container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(getByRole('checkbox', { name: enUSEditor.backgroundPicker.groups.color }));
    expect(currentRotation()?.sources).toEqual(['color']);
    expect(currentRotation()?.starterBackgroundIds?.color ?? []).toEqual([]);
    expect(getByTestId('starter-group-color').textContent).toContain('0/');
    expect(getByText(enUSEditor.backgroundPicker.pickToRotate)).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="starter-source-color"] input[type="checkbox"]')).toHaveLength(1);

    const tile = container.querySelector('[data-testid^="starter-background-"][aria-label^="Include"]') as HTMLElement;
    expect(tile.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(tile);
    expect(currentRotation()?.starterBackgroundIds?.color).toHaveLength(1);
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    // Selecting a tile in rotation mode never overwrites the fixed background.
    expect(useEditorStore.getState().config!.screens[0].backgroundImage).toBe('/starter-backgrounds/ocean.svg');
    fireEvent.click(tile);
    expect(currentRotation()?.starterBackgroundIds?.color).toEqual([]);
  });

  it('with the group off, a tile is a fixed pick that ends rotation', () => {
    seedStore({ sources: ['icloud'], query: '', intervalMinutes: 30 }, '/starter-backgrounds/ocean.svg');
    const { getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(getByTestId('starter-background-theme-linen'));
    expect(currentRotation()?.sources).toEqual([]);
    expect(useEditorStore.getState().config!.screens[0].backgroundImage).toBe('/starter-backgrounds/theme-linen.svg');
  });

  it('labels the Sources card as fixed or rotating', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { getByTestId, getByRole } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(getByTestId('background-mode').textContent).toBe(enUSEditor.backgroundPicker.modeFixed);
    expect(getByTestId('background-mode').getAttribute('title')).toBe(enUSEditor.backgroundPicker.modeHelp);
    fireEvent.click(getByRole('checkbox', { name: enUSEditor.backgroundPicker.groups.color }));
    expect(getByTestId('background-mode').textContent).toBe(enUSEditor.backgroundPicker.modeRotating);
  });

  it('themes are a single choice: no rotation checkbox, and a tile is always a fixed pick', () => {
    // A `theme` entry left over from when themes were a rotation source is ignored.
    seedStore({ sources: ['theme' as never], query: '', intervalMinutes: 60 }, '/starter-backgrounds/ocean.svg');
    const { getByTestId, queryByRole } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(queryByRole('checkbox', { name: enUSEditor.backgroundPicker.groups.theme })).toBeNull();
    // The stale entry does not make the screen look like it rotates.
    expect(getByTestId('background-mode').textContent).toBe(enUSEditor.backgroundPicker.modeFixed);
    const tile = getByTestId('starter-background-theme-linen');
    expect(tile.getAttribute('aria-label')).toBe('Use Linen as a fixed background');
    fireEvent.click(tile);
    expect(useEditorStore.getState().config!.screens[0].backgroundImage).toBe('/starter-backgrounds/theme-linen.svg');
    expect(getByTestId('background-mode').textContent).toBe(enUSEditor.backgroundPicker.modeFixed);
  });

  it('shows a visible hint and a disabled checkbox for sources that are not set up', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { getByTestId, getByRole } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const immich = getByRole('checkbox', { name: new RegExp(enUSEditor.backgroundPicker.sources.immich) }) as HTMLInputElement;
    expect(immich.disabled).toBe(true);
    expect(immich.closest('label')!.getAttribute('title')).toContain(enUSEditor.backgroundPicker.sources.immich);
    const hint = getByTestId('background-source-not-set-up-immich');
    expect(hint.textContent).toContain(enUSEditor.backgroundPicker.sourceNotSetUp);
    const settingsLink = within(hint).getByTestId('integration-settings-link-immich') as HTMLAnchorElement;
    expect(settingsLink.getAttribute('href')).toContain('integrations.immich');
    expect(settingsLink.textContent).toContain(enUSEditor.backgroundPicker.sources.immich);
    expect(getByTestId('background-source-not-set-up-nasa-apod')).not.toBeNull();
  });

  it('lets a stale, already-enabled source that lost its key be turned off', () => {
    seedStore({ sources: ['immich'], query: '', intervalMinutes: 60 });
    const { getByRole, getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const immich = getByRole('checkbox', { name: new RegExp(enUSEditor.backgroundPicker.sources.immich) }) as HTMLInputElement;
    expect(immich.disabled).toBe(false);
    expect(getByTestId('background-source-key-missing')).not.toBeNull();
    fireEvent.click(immich);
    expect(currentRotation()?.sources).toEqual([]);
  });

  it('choosing a fixed wall then None ends rotation and retains other rotation settings', () => {
    seedStore({ enabled: true, sources: ['icloud', 'local'], query: '', intervalMinutes: 30, localFolder: 'holiday' }, '/starter-backgrounds/ocean.svg');
    const { getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(getByTestId('starter-background-theme-linen'));
    let screen = useEditorStore.getState().config!.screens[0];
    expect(screen.backgroundImage).toBe('/starter-backgrounds/theme-linen.svg');
    expect(screen.backgroundRotation).toMatchObject({ sources: [], localFolder: 'holiday', intervalMinutes: 30 });
    expect(screen.backgroundRotation).not.toHaveProperty('enabled');
    fireEvent.click(getByTestId('starter-background-none'));
    screen = useEditorStore.getState().config!.screens[0];
    expect(screen.backgroundImage).toBe('');
    expect(screen.backgroundRotation?.sources).toEqual([]);
  });

  it('None disables rotation even when no fixed image was set', () => {
    seedStore({ enabled: true, sources: ['icloud'], query: '', intervalMinutes: 60 });
    const { getByTestId, getByText } = render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(getByText(enUSEditor.backgroundPicker.groups.color).closest('label')!.querySelector('input')!);
    expect(getByTestId('starter-background-none').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(getByTestId('starter-background-none'));
    expect(useEditorStore.getState().config!.screens[0].backgroundRotation?.sources).toEqual([]);
  });
});

describe('BackgroundPicker — Unsplash search picker', () => {
  const PHOTOS = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`, description: `Photo ${i}`, thumb: `/t${i}.jpg`, regular: `https://images.example/p${i}.jpg`,
    authorName: `Author ${i}`, downloadUrl: `https://api.unsplash.com/photos/p${i}/download`,
  }));
  let calls: Array<{ url: string; init?: RequestInit }> = [];

  function stubUnsplash() {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      if (url.startsWith('/api/unsplash') && init?.method === 'POST') {
        const { filename } = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ path: `/api/backgrounds/serve?file=${filename}.jpg` }), { status: 201 });
      }
      if (url.startsWith('/api/unsplash')) return new Response(JSON.stringify({ photos: PHOTOS, totalPages: 3, total: 24 }));
      return new Response('[]');
    }));
  }
  afterEach(() => { vi.unstubAllGlobals(); });

  const seed = (extra: object = {}) => seedStore({ sources: ['unsplash'], query: 'mountains', intervalMinutes: 60, unsplashMode: 'query', ...extra } as never);

  it('calls the mode Search, searches the saved term, and shows eight results with the pager above them', async () => {
    stubUnsplash();
    seed();
    const { findAllByTestId, getAllByText, container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(enUSEditor.backgroundPicker.unsplash.modeQuery).toBe('Search');
    expect(getAllByText('Search')[0].closest('.grid-cols-2')?.textContent).toContain(enUSEditor.backgroundPicker.unsplash.modeCollections);
    const tiles = await findAllByTestId('search-photo');
    expect(tiles).toHaveLength(8);
    const search = calls.find((c) => c.url.startsWith('/api/unsplash?'))!;
    expect(search.url).toContain('query=mountains');
    expect(search.url).toContain('per_page=8');
    const picker = container.querySelector('[data-testid="unsplash-search-picker"]')!;
    const pager = within(picker as HTMLElement).getByText(/Page 1 of 3/);
    expect(pager.compareDocumentPosition(tiles[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(picker as HTMLElement).queryByRole('button', { name: 'Nature' })).toBeNull();
  });

  it('picks save a hidden copy once and add it to the screen; tapping again just unchooses it', async () => {
    stubUnsplash();
    seed();
    const { findAllByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const tiles = await findAllByTestId('search-photo');
    fireEvent.click(tiles[2]);
    await waitFor(() => expect(currentRotation()?.unsplashImages).toEqual(['/api/backgrounds/serve?file=rotation-unsplash-pick-p2.jpg']));
    const post = calls.find((c) => c.init?.method === 'POST')!;
    expect(JSON.parse(String(post.init!.body))).toMatchObject({ filename: 'rotation-unsplash-pick-p2', imageUrl: PHOTOS[2].regular });
    await waitFor(async () => expect((await findAllByTestId('search-photo'))[2].getAttribute('aria-pressed')).toBe('true'));

    fireEvent.click(tiles[5]);
    await waitFor(() => expect(currentRotation()?.unsplashImages).toHaveLength(2));

    const postsBefore = calls.filter((c) => c.init?.method === 'POST').length;
    fireEvent.click(tiles[2]);
    await waitFor(() => expect(currentRotation()?.unsplashImages).toEqual(['/api/backgrounds/serve?file=rotation-unsplash-pick-p5.jpg']));
    expect(calls.filter((c) => c.init?.method === 'POST')).toHaveLength(postsBefore);
  });

  it('a submitted search is remembered as the rotation term', async () => {
    stubUnsplash();
    seed();
    const { findAllByTestId, getByPlaceholderText, container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    await findAllByTestId('search-photo');
    const input = getByPlaceholderText(enUSEditor.imageBrowsers.unsplash.searchPlaceholder);
    fireEvent.change(input, { target: { value: 'ocean waves' } });
    fireEvent.click(within(container.querySelector('[data-testid="unsplash-search-picker"]') as HTMLElement).getByRole('button', { name: enUSEditor.imageBrowsers.search.searchButton }));
    expect(currentRotation()?.query).toBe('ocean waves');
    await waitFor(() => expect(calls.some((c) => c.url.includes('query=ocean%20waves'))).toBe(true));
  });

  it('Collections mode keeps its own fields and shows no search grid', () => {
    stubUnsplash();
    seed({ unsplashMode: 'collections', unsplashCollections: [''] });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(container.querySelector('[data-testid="unsplash-search-picker"]')).toBeNull();
    expect(container.querySelector('input[placeholder*="ollection"]')).not.toBeNull();
  });
});

describe('BackgroundPicker — Local library', () => {
  const LIBRARY = ['/api/backgrounds/serve?file=a.jpg', '/api/backgrounds/serve?file=b.jpg'];

  function stubLibrary(onUpload?: () => Response) {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return onUpload ? onUpload() : new Response('{}');
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      return new Response(JSON.stringify(url.startsWith('/api/backgrounds') ? LIBRARY : []));
    }));
  }
  afterEach(() => { vi.unstubAllGlobals(); });

  it('offers a folder or pictures; pictures start with nothing chosen', async () => {
    stubLibrary();
    seedStore({ sources: ['local'], query: '', intervalMinutes: 60 });
    const { getByTestId, findAllByTestId, getByText } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(getByTestId('local-mode-folder').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(getByTestId('local-mode-images'));
    expect(currentRotation()?.localMode).toBe('images');
    const tiles = await findAllByTestId('local-picture');
    expect(tiles).toHaveLength(2);
    expect(tiles.every((tile) => tile.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(getByText(enUSEditor.backgroundPicker.local.upload)).not.toBeNull();
  });

  it('lists Pictures before Folder, with 2-column portrait tiles on a portrait display', async () => {
    stubLibrary();
    seedStore({ sources: ['local'], query: '', intervalMinutes: 60, localMode: 'images' });
    const portraitCfg = useEditorStore.getState().config!;
    useEditorStore.setState({ config: { ...portraitCfg, settings: { ...portraitCfg.settings, displayTransform: '90' } } });
    const { getByTestId, findAllByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const pictures = getByTestId('local-mode-images');
    const folder = getByTestId('local-mode-folder');
    expect(pictures.compareDocumentPosition(folder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const tiles = await findAllByTestId('local-picture');
    const grid = tiles[0].parentElement!;
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('gap-1.5');
    expect(grid.className).toContain('max-h-[400px]');
    expect(tiles[0].className).toContain('aspect-[9/16]');
  });

  it('uses landscape tiles on a landscape display', async () => {
    stubLibrary();
    seedStore({ sources: ['local'], query: '', intervalMinutes: 60, localMode: 'images' });
    const cfg = useEditorStore.getState().config!;
    useEditorStore.setState({ config: { ...cfg, settings: { ...cfg.settings, displayWidth: 1920, displayHeight: 1080, displayTransform: 'normal' } } });
    const { findAllByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const tiles = await findAllByTestId('local-picture');
    expect(tiles[0].className).toContain('aspect-video');
  });

  it('tapping pictures adds and removes them, like the color walls', async () => {
    stubLibrary();
    seedStore({ sources: ['local'], query: '', intervalMinutes: 60, localMode: 'images' });
    const { findAllByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const tiles = await findAllByTestId('local-picture');
    fireEvent.click(tiles[0]);
    expect(currentRotation()?.localImages).toEqual([LIBRARY[0]]);
    fireEvent.click(tiles[1]);
    expect(currentRotation()?.localImages).toEqual(LIBRARY);
    fireEvent.click(tiles[0]);
    expect(currentRotation()?.localImages).toEqual([LIBRARY[1]]);
    // The folder setting is kept for when the user switches back.
    expect(currentRotation()?.localMode).toBe('images');
  });

  it('an uploaded picture joins the library and is chosen', async () => {
    stubLibrary(() => new Response(JSON.stringify({ path: '/api/backgrounds/serve?file=new.jpg' })));
    seedStore({ sources: ['local'], query: '', intervalMinutes: 60, localMode: 'images' });
    const { container, findAllByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    await findAllByTestId('local-picture');
    const input = container.querySelector('[data-testid="local-pictures"] input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'new.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(currentRotation()?.localImages).toEqual(['/api/backgrounds/serve?file=new.jpg']));
    expect((await findAllByTestId('local-picture'))).toHaveLength(3);
  });

  it('iCloud is locked up front like NASA, with its link field already visible to unlock it', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { getByRole, container, queryByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const box = getByRole('checkbox', { name: new RegExp(enUSEditor.backgroundPicker.sources.icloud) }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(queryByTestId('icloud-needs-link')).not.toBeNull();
    const input = container.querySelector('input[type="url"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://www.icloud.com/sharedalbum/#B0aGdXWuDG1PYBr' } });
    expect((getByRole('checkbox', { name: new RegExp(enUSEditor.backgroundPicker.sources.icloud) }) as HTMLInputElement).disabled).toBe(false);
    expect(queryByTestId('icloud-needs-link')).toBeNull();
    // Unlocking does not turn the source on by itself.
    expect(currentRotation()?.sources).toEqual([]);
  });

  it('folder mode shows just the folder: no image gallery', () => {
    stubLibrary();
    seedStore({ sources: ['local'], query: '', intervalMinutes: 60 });
    const { getByText, container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(getByText(enUSEditor.backgroundPicker.local.allPhotosRoot)).not.toBeNull();
    expect(container.querySelector('[data-testid="local-pictures"]')).toBeNull();
    const localBlock = getByText(enUSEditor.backgroundPicker.local.allPhotosRoot).closest('div')!.parentElement!;
    expect(localBlock.querySelectorAll('img')).toHaveLength(0);
  });

  it('pictures mode has no "None selected yet." line', () => {
    stubLibrary();
    seedStore({ sources: ['local'], query: '', intervalMinutes: 60, localMode: 'images' });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(container.textContent).not.toContain('None selected yet');
    expect(container.textContent).toContain(enUSEditor.backgroundPicker.picturesHint);
  });

  it('iCloud says it is not active until a valid album link is pasted', () => {
    seedStore({ sources: ['icloud'], query: '', intervalMinutes: 60 });
    const { queryByTestId, container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(queryByTestId('icloud-needs-link')).not.toBeNull();
    const input = container.querySelector('input[type="url"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://www.icloud.com/sharedalbum/#B0aGdXWuDG1PYBr' } });
    expect(queryByTestId('icloud-needs-link')).toBeNull();
  });
});

describe('BackgroundPicker — effects', () => {
  it('edits effect sliders directly without a preset picker', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { getByText, queryByRole } = render(<BackgroundPicker />, { wrapper: Wrapper });

    expect(queryByRole('combobox', { name: /preset/i })).toBeNull();

    const warmthSlider = getByText(enUSEditor.backgroundPicker.effectsWarmthLabel).closest('label')!.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(warmthSlider, { target: { value: '12' } });

    expect(useEditorStore.getState().config?.screens[0].effects).toEqual({
      brightness: 100, contrast: 100, saturation: 100, warmth: 12,
    });
  });

  it('resets an individual effect slider from the right-side reset button', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { getByText, getByLabelText } = render(<BackgroundPicker />, { wrapper: Wrapper });

    const warmthSlider = getByText(enUSEditor.backgroundPicker.effectsWarmthLabel).closest('label')!.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(warmthSlider, { target: { value: '12' } });
    fireEvent.click(getByLabelText(`Reset ${enUSEditor.backgroundPicker.effectsWarmthLabel}`));

    expect(useEditorStore.getState().config?.screens[0].effects).toEqual({
      brightness: 100, contrast: 100, saturation: 100, warmth: 0,
    });
  });
});

describe('BackgroundPicker — per-source collapse', () => {
  afterEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

  it('collapses and expands every checked source without changing config', () => {
    seedStore({ sources: ['unsplash', 'nasa-apod', 'local', 'icloud'], query: 'x', intervalMinutes: 60 } as never);
    const { getByTestId, queryByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const before = JSON.stringify(currentRotation());

    for (const id of ['unsplash', 'nasa-apod', 'local', 'icloud']) {
      const btn = getByTestId(`source-group-${id}`);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      const panel = document.getElementById(btn.getAttribute('aria-controls')!);
      expect(panel).not.toBeNull();
      fireEvent.click(btn);
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      expect(document.getElementById(btn.getAttribute('aria-controls')!)).toBeNull();
      const checkbox = within(getByTestId(`source-row-${id}`)).getAllByRole('checkbox')[0] as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    }
    expect(JSON.stringify(currentRotation())).toBe(before);
    fireEvent.click(getByTestId('source-group-nasa-apod'));
    expect(getByTestId('source-group-nasa-apod').getAttribute('aria-expanded')).toBe('true');
    expect(queryByTestId('source-group-immich')).not.toBeNull();
  });

  it('keeps a working chevron on unselected and unconfigured sources, with the setup hint inside the panel and a tooltip', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { getByTestId, queryByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const before = JSON.stringify(currentRotation());
    for (const id of ['unsplash', 'nasa-apod', 'immich', 'icloud', 'local']) {
      const btn = getByTestId(`source-group-${id}`);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      fireEvent.click(btn);
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(btn);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
    }
    expect(getByTestId('source-group-nasa-apod').getAttribute('title')).toContain(enUSEditor.backgroundPicker.sourceNotSetUp);
    expect(getByTestId('source-group-icloud').getAttribute('title')).toBe(enUSEditor.backgroundPicker.icloud.needsLink);
    expect(getByTestId('source-group-local').getAttribute('title')).toBeNull();
    fireEvent.click(getByTestId('source-group-nasa-apod'));
    expect(queryByTestId('background-source-not-set-up-nasa-apod')).toBeNull();
    fireEvent.click(getByTestId('source-group-nasa-apod'));
    expect(getByTestId('background-source-not-set-up-nasa-apod')).not.toBeNull();
    expect(JSON.stringify(currentRotation())).toBe(before);
  });

  it('re-expands a collapsed source when it is ticked again', () => {
    seedStore({ sources: ['nasa-apod'], query: 'x', intervalMinutes: 60 } as never);
    const { getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(getByTestId('source-group-nasa-apod'));
    const checkbox = within(getByTestId('source-row-nasa-apod')).getAllByRole('checkbox')[0];
    fireEvent.click(checkbox);
    expect(currentRotation()?.sources).not.toContain('nasa-apod');
    fireEvent.click(within(getByTestId('source-row-nasa-apod')).getAllByRole('checkbox')[0]);
    expect(currentRotation()?.sources).toContain('nasa-apod');
    expect(getByTestId('source-group-nasa-apod').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('BackgroundPicker — Immich pick mode', () => {
  const photos = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({
    id: `a${from + i}`, thumb: `/api/immich/serve?assetId=a${from + i}&size=thumbnail`, alt: `IMG_${from + i}.jpg`, date: '2024-01-01',
  }));
  let calls: Array<{ url: string; init?: RequestInit }> = [];

  function stubImmich() {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      if (url === '/api/immich/albums') return new Response(JSON.stringify([{ id: 'alb1', name: 'Trips', assetCount: 20 }]));
      if (url === '/api/immich/pick') {
        const { assetId } = JSON.parse(String(init!.body));
        return new Response(JSON.stringify({ path: `/api/backgrounds/serve?file=rotation-immich-pick-${assetId}.jpg` }), { status: 201 });
      }
      if (url.startsWith('/api/immich/search')) {
        const page = Number(new URL(url, 'http://x').searchParams.get('page'));
        return new Response(JSON.stringify({ photos: photos(9, (page - 1) * 9), page, hasNext: page < 2 }));
      }
      return new Response('[]');
    }));
  }
  afterEach(() => { vi.unstubAllGlobals(); });
  beforeEach(() => { secrets.immich = true; });

  it('legacy configs (Immich already on, no mode) stay on Filters; Pictures is listed first and switches', async () => {
    stubImmich();
    seedStore({ sources: ['immich'], query: '', intervalMinutes: 60 } as never);
    const { getByTestId, queryByTestId, findAllByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(getByTestId('immich-mode-filters').getAttribute('aria-pressed')).toBe('true');
    expect(queryByTestId('immich-pick-picker')).toBeNull();
    expect(getByTestId('immich-mode-pick').textContent).toBe('Pictures');
    expect(getByTestId('immich-mode-pick').compareDocumentPosition(getByTestId('immich-mode-filters')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(getByTestId('immich-mode-pick'));
    expect(currentRotation()?.immichMode).toBe('pick');
    expect(await findAllByTestId('search-photo')).toHaveLength(9);
    fireEvent.click(getByTestId('immich-mode-filters'));
    expect(currentRotation()?.immichMode).toBe('filters');
  });

  it('shows a page of tiles with no search box, an album dropdown, and prev/next without totals', async () => {
    stubImmich();
    seedStore({ sources: ['immich'], query: '', intervalMinutes: 60, immichMode: 'pick' } as never);
    const { findAllByTestId, getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const tiles = await findAllByTestId('search-photo');
    expect(tiles).toHaveLength(9);
    const picker = getByTestId('immich-pick-picker');
    expect(picker.querySelector('input[type="text"]')).toBeNull();
    expect(picker.querySelector('.grid-cols-2')).not.toBeNull();
    expect(picker.textContent).toContain(enUSEditor.backgroundPicker.picturesHint);
    expect(within(picker).queryByText(/Page \d+ of/)).toBeNull();
    const prev = within(picker).getByRole('button', { name: enUSEditor.imageBrowsers.search.prev }) as HTMLButtonElement;
    const next = within(picker).getByRole('button', { name: enUSEditor.imageBrowsers.search.next }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect(calls.find((c) => c.url.startsWith('/api/immich/search'))!.url).toBe('/api/immich/search?page=1');

    fireEvent.click(next);
    await waitFor(() => expect(calls.some((c) => c.url === '/api/immich/search?page=2')).toBe(true));
    await waitFor(() => expect((within(picker).getByRole('button', { name: enUSEditor.imageBrowsers.search.next }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('choosing an album searches within it from page 1; All photos clears it', async () => {
    stubImmich();
    seedStore({ sources: ['immich'], query: '', intervalMinutes: 60, immichMode: 'pick' } as never);
    const { findAllByTestId, getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    await findAllByTestId('search-photo');
    await waitFor(() => expect(getByTestId('immich-pick-album').querySelectorAll('option')).toHaveLength(2));
    expect(getByTestId('immich-pick-album').querySelector('option')!.textContent).toBe(enUSEditor.imageBrowsers.immich.allPhotos);
    fireEvent.change(getByTestId('immich-pick-album'), { target: { value: 'alb1' } });
    await waitFor(() => expect(calls.some((c) => c.url === '/api/immich/search?page=1&albumId=alb1')).toBe(true));
  });

  it('picks save once and rotate when several; tapping again unchooses', async () => {
    stubImmich();
    seedStore({ sources: ['immich'], query: '', intervalMinutes: 60, immichMode: 'pick' } as never);
    const { findAllByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const tiles = await findAllByTestId('search-photo');
    fireEvent.click(tiles[2]);
    await waitFor(() => expect(currentRotation()?.immichImages).toEqual(['/api/backgrounds/serve?file=rotation-immich-pick-a2.jpg']));
    await waitFor(async () => expect((await findAllByTestId('search-photo'))[2].getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(tiles[5]);
    await waitFor(() => expect(currentRotation()?.immichImages).toHaveLength(2));
    const posts = calls.filter((c) => c.url === '/api/immich/pick').length;
    fireEvent.click(tiles[2]);
    await waitFor(() => expect(currentRotation()?.immichImages).toEqual(['/api/backgrounds/serve?file=rotation-immich-pick-a5.jpg']));
    expect(calls.filter((c) => c.url === '/api/immich/pick')).toHaveLength(posts);
  });
});

describe('BackgroundPicker — unchecked sources keep their controls', () => {
  beforeEach(() => { secrets.immich = true; });
  afterEach(() => { vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* ignore */ } });

  function stubAll() {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      if (url.startsWith('/api/immich/search')) return new Response(JSON.stringify({ photos: [{ id: 'a1', thumb: '/t.jpg', alt: 'a', date: '' }], hasNext: false }));
      if (url.startsWith('/api/unsplash')) return new Response(JSON.stringify({ photos: [], totalPages: 1 }));
      return new Response('[]');
    }));
  }

  it('shows the real controls of every configured source while unchecked, without enabling it', async () => {
    stubAll();
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { getByTestId, queryByTestId, container, findByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(getByTestId('unsplash-mode-query')).not.toBeNull();
    expect(await findByTestId('unsplash-search-picker')).not.toBeNull();
    expect(getByTestId('immich-mode-pick')).not.toBeNull();
    expect(await findByTestId('immich-pick-picker')).not.toBeNull();
    expect(getByTestId('local-mode-folder')).not.toBeNull();
    expect(container.textContent).toContain(enUSEditor.backgroundPicker.nasaInfo);
    expect(container.querySelector('input[type="url"]')).not.toBeNull();
    expect(queryByTestId('background-source-not-set-up-immich')).toBeNull();
    expect(currentRotation()?.sources).toEqual([]);
  });

  it('edits made while unchecked are saved with defaults and leave the source out of rotation', () => {
    stubAll();
    seedStore(undefined);
    const { getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(getByTestId('local-mode-images'));
    expect(currentRotation()).toMatchObject({ sources: [], localMode: 'images', intervalMinutes: 60 });
  });

  it('an unconfigured keyed source shows only its setup hint', () => {
    secrets.immich = false;
    stubAll();
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { getByTestId, queryByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(getByTestId('background-source-not-set-up-immich')).not.toBeNull();
    expect(queryByTestId('immich-mode-pick')).toBeNull();
  });

  it('every mode toggle lists its pictures-like option first', () => {
    stubAll();
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    for (const [first, second] of [['unsplash-mode-query', 'unsplash-mode-collections'], ['immich-mode-pick', 'immich-mode-filters'], ['local-mode-images', 'local-mode-folder']]) {
      expect(getByTestId(first).compareDocumentPosition(getByTestId(second)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(getByTestId(first).parentElement).toBe(getByTestId(second).parentElement);
    }
  });

  it('new configs open Immich on Pictures and pin the mode when the source is ticked', () => {
    stubAll();
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { getByTestId, getByRole } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(getByTestId('immich-mode-pick').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(getByRole('checkbox', { name: new RegExp(enUSEditor.backgroundPicker.sources.immich) }));
    expect(currentRotation()).toMatchObject({ sources: ['immich'], immichMode: 'pick' });
    expect(getByTestId('immich-mode-pick').getAttribute('aria-pressed')).toBe('true');
  });

  it('a legacy config with Immich filters set stays on Filters even when unticked', () => {
    stubAll();
    seedStore({ sources: [], query: '', intervalMinutes: 60, immichFavoritesOnly: true });
    const { getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(getByTestId('immich-mode-filters').getAttribute('aria-pressed')).toBe('true');
  });
});

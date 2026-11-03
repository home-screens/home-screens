// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import type { MediaInventory } from '@/lib/media-inventory';
import type { MediaUse } from '@/lib/media-usage';

const confirmState = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@/stores/confirm-store', () => ({
  useConfirmStore: { getState: () => ({ confirm: confirmState.ask }) },
}));

const editorFetch = vi.fn();
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => editorFetch(...args),
  isSessionExpired: () => false,
}));

const invalidateByPrefix = vi.fn();
vi.mock('@/lib/display-cache', () => ({
  displayCache: { invalidateByPrefix: (...args: unknown[]) => invalidateByPrefix(...args) },
}));

const libraryOps = vi.hoisted(() => ({
  move: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));
vi.mock('@/lib/library-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/library-client')>('@/lib/library-client');
  return {
    ...actual,
    moveLibraryFiles: (...args: unknown[]) => libraryOps.move(...args),
    createLibraryFolder: (...args: unknown[]) => libraryOps.createFolder(...args),
    renameLibraryFolder: (...args: unknown[]) => libraryOps.renameFolder(...args),
    deleteLibraryFolder: (...args: unknown[]) => libraryOps.deleteFolder(...args),
  };
});

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));

const storeState = vi.hoisted(() => ({
  selectedDisplayId: null as string | null,
  setSelectedDisplay: vi.fn(),
  selectScreen: vi.fn(),
  selectModule: vi.fn(),
  adoptHubRewrite: vi.fn(async (_change: { rewrite: (config: unknown) => unknown; previousRevision: string | null; revision: string }) => {}),
}));
vi.mock('@/stores/editor-store', () => ({
  useEditorStore: { getState: () => storeState },
}));

import MediaLibraryPage from '../MediaLibraryPage';

/**
 * Placeholder-only templates for the keys whose runtime values the tests
 * must see surface (usage names, refused filenames, tile labels). Everything
 * else stays untranslated so t() returns the key: assertions stay structural
 * and never pin English copy.
 */
const BLOB = {
  editor: {
    settings: {
      mediaPage: {
        kind: { screen: 'screen:{name}', dayRule: 'dayRule:{name}', module: 'module:{name}', slideshow: 'slideshow:{name}', slideshowLast: 'slideshow-last:{name}', rotation: 'rotation', other: '{name}' },
        unnamed: 'untitled',
        inSlideshow: 'slideshow-badge',
        refused: '{file}',
        keptLast: 'kept-last {file} {name}',
        viewer: { lastPictureHint: 'last-hint {folder}' },
        open: 'open {file}',
        select: 'select {file}',
        deleteOne: 'delete {file}',
        deleteFailed: { one: 'failed:{count}', other: 'failed:{count}' },
        storage: 'uses {size} free {free}',
        storageNoFree: 'uses {size}',
        missingFile: 'missing-file {where} {path}',
        missingFolder: 'missing-folder {where} {path}',
        replaced: 'replaced {file}',
        replaceFailed: 'replace-failed {file}',
        moved: { one: 'moved:{count}', other: 'moved:{count}' },
        placesUpdated: { one: 'places:{count}', other: 'places:{count}' },
        folderCreated: 'created {name}',
        folderRenamed: 'renamed {name}',
        folderDeleted: 'deleted {name}',
      },
    },
    refusals: {
      library: {
        fileExists: '{name} already in that folder',
        folderNotEmpty: 'not-empty',
      },
    },
  },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={BLOB}>{children}</I18nProvider>;
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Root has an image, a video and an svg; nature holds two images and a mov. */
function seedInventory(): MediaInventory {
  return {
    items: [
      { path: 'clips/walk.mp4', kind: 'video', bytes: 5184000, mtimeMs: 1000 },
      { path: 'lake_sunset.jpg', kind: 'image', bytes: 5344000, mtimeMs: 6000, width: 4032, height: 3024 },
      { path: 'nature/foggy_ridge.webp', kind: 'image', bytes: 1994000, mtimeMs: 2000, width: 2560, height: 1440 },
      { path: 'nature/forest_morning.jpg', kind: 'image', bytes: 5033000, mtimeMs: 3000, width: 4032, height: 3024 },
      { path: 'nature/sledding.mov', kind: 'video', bytes: 112000000, mtimeMs: 4000 },
      { path: 'waves.svg', kind: 'image', bytes: 12000, mtimeMs: 5000, width: 1200, height: 800 },
    ],
    directories: [
      { name: 'clips', path: 'clips' },
      { name: 'nature', path: 'nature' },
    ],
    usage: {
      'nature/forest_morning.jpg': [
        { kind: 'screen', name: 'Hall', configPath: 'screens[0].backgroundImage', screenId: 's-hall' },
      ],
      'clips/walk.mp4': [
        { kind: 'module', configPath: 'screens[1].modules[0].config.file', displayId: 'd-den', screenId: 's-den', moduleId: 'm-video' },
      ],
    },
    missing: [],
    storage: { bytes: 129567000, freeBytes: 30000000000, totalBytes: 60000000000 },
    slideshows: [],
  };
}

const DEN_SLIDESHOW: MediaUse = { kind: 'slideshow', name: 'Den', configPath: 'screens[1].modules[1].config.directory', screenId: 's-den', moduleId: 'm-slides' };
const PORCH_SLIDESHOW: MediaUse = { kind: 'slideshow', name: 'Porch', configPath: 'screens[2].modules[0].config.directory', screenId: 's-porch', moduleId: 'm-clips' };

/**
 * The seed with slideshows: Den plays both nature pictures (one of which a
 * screen also uses), and walk.mp4 is the only file Porch has.
 */
function slideshowInventory(): MediaInventory {
  const inv = seedInventory();
  inv.usage = {
    'nature/foggy_ridge.webp': [DEN_SLIDESHOW],
    'nature/forest_morning.jpg': [...inv.usage['nature/forest_morning.jpg'], DEN_SLIDESHOW],
    'clips/walk.mp4': [PORCH_SLIDESHOW],
  };
  return inv;
}

/**
 * Wire editorFetch: inventory GETs read live state (successful DELETEs drop
 * the file from subsequent inventories), DELETE answers 409 for paths listed
 * in `refuse` (with that path's `refusedUsage` as the where-used list) and
 * 500 for paths in `fail`, POST uploads succeed.
 */
function mockApi(
  refuse: string[] = [],
  fail: string[] = [],
  { seed = seedInventory, refusedUsage = {} }: { seed?: () => MediaInventory; refusedUsage?: Record<string, MediaUse[]> } = {},
) {
  const inv = seed();
  editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/backgrounds/inventory') return jsonRes(inv);
    if (init?.method === 'DELETE') {
      const body = JSON.parse(String(init.body)) as { file: string; directory?: string };
      const path = body.directory ? `${body.directory}/${body.file}` : body.file;
      if (refuse.includes(path)) return jsonRes({ error: 'in use', usage: refusedUsage[path] ?? [] }, 409);
      if (fail.includes(path)) return jsonRes({ error: 'Failed to delete background' }, 500);
      inv.items = inv.items.filter((i) => i.path !== path);
      return jsonRes({ deleted: body.file });
    }
    if (init?.method === 'POST') {
      const body = init.body as FormData;
      if (body.get('replace')) {
        return fail.includes(String(body.get('replace')))
          ? jsonRes({ error: 'The new file needs to end in .jpg like the one it replaces' }, 400)
          : jsonRes({ path: '/api/backgrounds/serve?file=x' });
      }
      return jsonRes({ paths: ['/x'] }, 201);
    }
    return jsonRes({});
  });
}

function inventoryCallCount(): number {
  return editorFetch.mock.calls.filter(([url]) => url === '/api/backgrounds/inventory').length;
}

function deleteCalls() {
  return editorFetch.mock.calls.filter(([, init]) => init?.method === 'DELETE');
}

function tile(path: string): HTMLElement {
  return screen.getByTestId(`media-tile-${path}`);
}

async function renderLoaded() {
  const view = render(<MediaLibraryPage />, { wrapper: Wrapper });
  await waitFor(() => {
    expect(view.container.querySelectorAll('[data-media-path]').length).toBe(6);
  });
  return view;
}

function select(path: string) {
  fireEvent.click(tile(path).querySelector('input[type="checkbox"]')!);
}

function openTile(path: string) {
  fireEvent.click(within(tile(path)).getByTestId('media-tile-open'));
}

/** The kept and refused lines, leaving out the failure count and the outcome line. */
function keptLines(): string[] {
  const box = screen.queryByTestId('media-refused');
  return box ? Array.from(box.querySelectorAll('p:not([data-testid])'), (p) => p.textContent ?? '') : [];
}

beforeEach(() => {
  editorFetch.mockReset();
  invalidateByPrefix.mockReset();
  routerPush.mockReset();
  libraryOps.move.mockReset();
  libraryOps.createFolder.mockReset();
  libraryOps.renameFolder.mockReset();
  libraryOps.deleteFolder.mockReset();
  storeState.selectedDisplayId = null;
  storeState.setSelectedDisplay.mockReset();
  storeState.selectScreen.mockReset();
  storeState.selectModule.mockReset();
  storeState.adoptHubRewrite.mockClear();
  confirmState.ask.mockReset();
  confirmState.ask.mockResolvedValue(true);
  mockApi();
});
afterEach(() => cleanup());

describe('MediaLibraryPage filters', () => {
  it('renders folder chips with live counts and the three kind segments', async () => {
    await renderLoaded();

    const chip = (folder: string) => screen.getByTestId(`media-chip-${folder || 'root'}`);
    expect(chip('all').querySelector('[data-count]')!.textContent).toBe('6');
    expect(chip('nature').querySelector('[data-count]')!.textContent).toBe('3');
    expect(chip('clips').querySelector('[data-count]')!.textContent).toBe('1');
    expect(chip('').querySelector('[data-count]')!.textContent).toBe('2');

    const kinds = within(screen.getByTestId('media-kind-filter')).getAllByRole('radio');
    expect(kinds).toHaveLength(3);
  });

  it('filters the grid by folder chip and kind segment together', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByTestId('media-chip-nature'));
    fireEvent.click(within(screen.getByTestId('media-kind-filter')).getByRole('radio', { name: 'settings.mediaPage.videos' }));

    const paths = Array.from(document.querySelectorAll('[data-media-path]'))
      .map((el) => el.getAttribute('data-media-path'));
    expect(paths).toEqual(['nature/sledding.mov']);
    // Chip counts follow the kind filter: only the two videos count now.
    expect(screen.getByTestId('media-chip-all').querySelector('[data-count]')!.textContent).toBe('2');
  });

  it('tells an empty filter apart from an empty library', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId('media-chip-clips'));
    fireEvent.click(within(screen.getByTestId('media-kind-filter')).getByRole('radio', { name: 'settings.mediaPage.images' }));
    expect(screen.getByTestId('media-empty').textContent).toBe('settings.mediaPage.emptyFiltered');
  });

  it('labels nested folders by their full path so same-named leaves stay apart', async () => {
    editorFetch.mockImplementation(async (url: string) => {
      if (url !== '/api/backgrounds/inventory') return jsonRes({});
      const inv = seedInventory();
      inv.directories = [
        { name: 'kids', path: 'summer/kids' },
        { name: 'summer', path: 'summer' },
        { name: 'kids', path: 'winter/kids' },
        { name: 'winter', path: 'winter' },
      ];
      return jsonRes(inv);
    });
    await renderLoaded();
    expect(screen.getByTestId('media-chip-summer/kids').textContent).toContain('summer/kids');
    expect(screen.getByTestId('media-chip-winter/kids').textContent).toContain('winter/kids');
    fireEvent.click(screen.getByTestId('media-upload-button'));
    const options = Array.from(screen.getByTestId('media-upload-panel').querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toContain('summer/kids');
    expect(options).toContain('winter/kids');
  });
});

describe('MediaLibraryPage tiles', () => {
  it('shows a type tag and lazy thumbnails: an image for pictures, a first frame for videos', async () => {
    await renderLoaded();
    const picture = tile('lake_sunset.jpg');
    const img = picture.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    // The grid asks for the small WebP copy; the viewer (tested below) keeps the original.
    expect(img.getAttribute('src')).toBe('/api/backgrounds/serve?file=lake_sunset.jpg&w=480&v=6000');
    expect(picture.querySelector('[data-type-tag]')!.textContent).toBe('JPG');

    const clip = tile('nature/sledding.mov');
    const video = clip.querySelector('video')!;
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(video.getAttribute('src')).toBe('/api/backgrounds/serve?file=nature%2Fsledding.mov&v=4000');
    expect(clip.querySelector('[data-type-tag]')!.textContent).toBe('MOV');
    expect(tile('waves.svg').querySelector('[data-type-tag]')!.textContent).toBe('SVG');
  });

  it('opens the viewer on tile click without touching the selection', async () => {
    await renderLoaded();
    openTile('lake_sunset.jpg');

    const viewer = screen.getByTestId('media-viewer');
    expect(within(viewer).getByTestId('media-viewer-name').textContent).toBe('lake_sunset.jpg');
    expect(within(viewer).getByTestId('media-viewer-image').getAttribute('src')).toBe('/api/backgrounds/serve?file=lake_sunset.jpg&v=6000');
    expect(within(viewer).getByTestId('media-viewer-used-by').textContent).toContain('settings.mediaPage.viewer.notUsed');
    expect(within(viewer).getByTestId('media-viewer-delete')).toBeTruthy();
    expect(tile('lake_sunset.jpg').hasAttribute('data-selected')).toBe(false);
    expect(screen.getByTestId('media-delete-button').hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByTestId('media-viewer-close'));
    expect(screen.queryByTestId('media-viewer')).toBeNull();
  });

  it('steps through the visible list with the arrow keys and closes on Escape', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId('media-chip-nature'));
    openTile('nature/foggy_ridge.webp');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('media-viewer-name').textContent).toBe('forest_morning.jpg');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('media-viewer-name').textContent).toBe('sledding.mov');
    expect(screen.getByTestId('media-viewer-video')).toBeTruthy();
    // Wraps around inside the filtered list, never into another folder.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('media-viewer-name').textContent).toBe('foggy_ridge.webp');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('media-viewer-name').textContent).toBe('sledding.mov');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('media-viewer')).toBeNull();
  });
});

describe('MediaLibraryPage used files', () => {
  it('badges the tile, hides the tile delete, and lists where it is used', async () => {
    await renderLoaded();

    const used = tile('nature/forest_morning.jpg');
    // Still selectable (a move keeps its references), but badged and never deletable from the tile.
    expect(used.querySelector('input[type="checkbox"]')!.hasAttribute('disabled')).toBe(false);
    expect(used.querySelector('[data-in-use]')).toBeTruthy();
    expect(used.querySelector('[data-used-by]')!.textContent).toContain('screen:Hall');
    expect(within(used).queryByTestId('media-tile-delete')).toBeNull();

    const unused = tile('lake_sunset.jpg');
    expect(unused.querySelector('[data-in-use]')).toBeNull();
    expect(within(unused).getByTestId('media-tile-delete')).toBeTruthy();
  });

  it('names an unnamed screen as untitled instead of leaking the template', async () => {
    await renderLoaded();
    expect(tile('clips/walk.mp4').querySelector('[data-used-by]')!.textContent).toContain('module:untitled');
  });

  it('still opens a used file in the viewer, which offers no delete', async () => {
    await renderLoaded();
    openTile('nature/forest_morning.jpg');
    const viewer = screen.getByTestId('media-viewer');
    expect(within(viewer).getByTestId('media-viewer-used-by').textContent).toContain('screen:Hall');
    expect(within(viewer).queryByTestId('media-viewer-delete')).toBeNull();
  });
});

describe('MediaLibraryPage slideshow pictures', () => {
  beforeEach(() => mockApi([], [], { seed: slideshowInventory }));

  it('badges a picture its slideshow can spare and leaves it deletable', async () => {
    await renderLoaded();

    const spare = tile('nature/foggy_ridge.webp');
    expect(spare.querySelector('[data-slideshow]')!.textContent).toBe('slideshow-badge');
    expect(spare.querySelector('[data-in-use]')).toBeNull();
    expect(within(spare).getByTestId('media-tile-delete')).toBeTruthy();
    expect(within(spare).getByTestId('media-tile-replace')).toBeTruthy();
    expect(spare.querySelector('[data-used-by]')!.textContent).toContain('slideshow:Den');

    openTile('nature/foggy_ridge.webp');
    expect(screen.getByTestId('media-viewer-delete')).toBeTruthy();
    expect(screen.queryByTestId('media-viewer-lock-hint')).toBeNull();
  });

  it('locks the last picture a slideshow has, and the viewer says why', async () => {
    await renderLoaded();

    const last = tile('clips/walk.mp4');
    expect(last.querySelector('[data-in-use]')).toBeTruthy();
    expect(last.querySelector('[data-slideshow]')).toBeNull();
    expect(within(last).queryByTestId('media-tile-delete')).toBeNull();
    expect(within(last).getByTestId('media-tile-replace')).toBeTruthy();
    expect(last.querySelector('[data-used-by]')!.textContent).toContain('slideshow-last:Porch');

    openTile('clips/walk.mp4');
    const viewer = screen.getByTestId('media-viewer');
    expect(within(viewer).getByTestId('media-viewer-lock-hint').textContent).toBe('last-hint clips');
    expect(within(viewer).getByTestId('media-viewer-used-by').textContent).toContain('slideshow-last:Porch');
    expect(within(viewer).queryByTestId('media-viewer-delete')).toBeNull();
  });

  it('keeps a picture a screen uses locked, even when its slideshow could spare it', async () => {
    await renderLoaded();

    const used = tile('nature/forest_morning.jpg');
    expect(used.querySelector('[data-in-use]')).toBeTruthy();
    expect(used.querySelector('[data-slideshow]')).toBeNull();
    expect(within(used).queryByTestId('media-tile-delete')).toBeNull();
    const usedBy = used.querySelector('[data-used-by]')!.textContent;
    expect(usedBy).toContain('screen:Hall');
    expect(usedBy).toContain('slideshow:Den');
    expect(usedBy).not.toContain('slideshow-last');

    openTile('nature/forest_morning.jpg');
    expect(screen.queryByTestId('media-viewer-delete')).toBeNull();
    // The hint is only for a slideshow's last picture.
    expect(screen.queryByTestId('media-viewer-lock-hint')).toBeNull();
  });

  it('names the slideshow when a delete keeps its last picture', async () => {
    mockApi(['clips/walk.mp4'], [], { seed: slideshowInventory, refusedUsage: { 'clips/walk.mp4': [PORCH_SLIDESHOW] } });
    await renderLoaded();

    select('clips/walk.mp4');
    select('lake_sunset.jpg');
    fireEvent.click(screen.getByTestId('media-delete-button'));

    await waitFor(() => expect(screen.queryByTestId('media-tile-lake_sunset.jpg')).toBeNull());
    expect(keptLines()).toEqual(['kept-last walk.mp4 Porch']);
    expect(tile('clips/walk.mp4')).toBeTruthy();
  });

  it('keeps the plain refused line when a 409 names other uses', async () => {
    mockApi(['nature/forest_morning.jpg'], [], {
      seed: slideshowInventory,
      refusedUsage: {
        'nature/forest_morning.jpg': [{ kind: 'screen', name: 'Hall', configPath: 'screens[0].backgroundImage', screenId: 's-hall' }],
      },
    });
    await renderLoaded();

    select('nature/forest_morning.jpg');
    fireEvent.click(screen.getByTestId('media-delete-button'));

    await waitFor(() => expect(keptLines()).toEqual(['forest_morning.jpg']));
    expect(deleteCalls()).toHaveLength(1);
  });

  it('names the slideshow when a move leaves its last picture behind', async () => {
    libraryOps.move.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        moved: [{ from: 'lake_sunset.jpg', to: 'nature/lake_sunset.jpg' }],
        kept: [{ path: 'clips/walk.mp4', usage: [PORCH_SLIDESHOW] }],
        rewritten: 0,
        revision: 'r1',
      },
    });
    await renderLoaded();

    select('clips/walk.mp4');
    select('lake_sunset.jpg');
    fireEvent.change(screen.getByTestId('media-move-select'), { target: { value: 'nature' } });

    await waitFor(() => expect(screen.getByTestId('media-outcome').textContent).toBe('moved:1'));
    expect(libraryOps.move).toHaveBeenCalledWith(['clips/walk.mp4', 'lake_sunset.jpg'], 'nature');
    expect(keptLines()).toEqual(['kept-last walk.mp4 Porch']);
  });
});

describe('MediaLibraryPage load failure', () => {
  it('shows a load-failure line instead of the empty state, and recovers on retry', async () => {
    let fail = true;
    editorFetch.mockImplementation(async (url: string) => {
      if (url === '/api/backgrounds/inventory') {
        return fail ? jsonRes({ error: 'boom' }, 500) : jsonRes(seedInventory());
      }
      return jsonRes({});
    });

    const view = render(<MediaLibraryPage />, { wrapper: Wrapper });
    expect(screen.getByTestId('media-loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('media-load-error')).toBeTruthy());
    // A failed load must not read as an empty library.
    expect(view.container.querySelector('[data-testid="media-empty"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="media-loading"]')).toBeNull();
    expect(view.container.querySelectorAll('[data-media-path]')).toHaveLength(0);

    fail = false;
    fireEvent.click(screen.getByTestId('media-retry-button'));
    await waitFor(() => {
      expect(view.container.querySelectorAll('[data-media-path]')).toHaveLength(6);
    });
    expect(screen.queryByTestId('media-load-error')).toBeNull();
  });
});

describe('MediaLibraryPage delete', () => {
  it('keeps the selection and sends no DELETE when the confirm is cancelled', async () => {
    confirmState.ask.mockResolvedValue(false);
    await renderLoaded();

    select('lake_sunset.jpg');
    select('waves.svg');
    fireEvent.click(screen.getByTestId('media-delete-button'));

    await waitFor(() => expect(confirmState.ask).toHaveBeenCalledTimes(1));
    expect(deleteCalls()).toHaveLength(0);
    // Selection survives the cancel, so Delete stays armed.
    expect(screen.getByTestId('media-delete-button').hasAttribute('disabled')).toBe(false);
    expect((tile('lake_sunset.jpg').querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
  });

  it('splits a nested path into file plus directory in the DELETE body', async () => {
    await renderLoaded();

    select('nature/foggy_ridge.webp');
    fireEvent.click(screen.getByTestId('media-delete-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('media-tile-nature/foggy_ridge.webp')).toBeNull();
    });
    expect(deleteCalls()).toHaveLength(1);
    expect(JSON.parse(String(deleteCalls()[0][1]!.body))).toEqual({
      file: 'foggy_ridge.webp',
      directory: 'nature',
    });
  });

  it('deletes each selected file sequentially, refetches, and drops the canvas cache', async () => {
    await renderLoaded();
    const deleteButton = screen.getByTestId('media-delete-button');
    expect(deleteButton.hasAttribute('disabled')).toBe(true);

    select('lake_sunset.jpg');
    select('waves.svg');
    expect(deleteButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(deleteButton);
    await waitFor(() => expect(confirmState.ask).toHaveBeenCalledTimes(1));
    expect(confirmState.ask.mock.calls[0][0]).toMatchObject({ variant: 'danger' });

    await waitFor(() => {
      expect(screen.queryByTestId('media-tile-lake_sunset.jpg')).toBeNull();
      expect(screen.queryByTestId('media-tile-waves.svg')).toBeNull();
    });
    expect(deleteCalls()).toHaveLength(2);
    expect(JSON.parse(String(deleteCalls()[0][1]!.body))).toEqual({ file: 'lake_sunset.jpg' });
    expect(JSON.parse(String(deleteCalls()[1][1]!.body))).toEqual({ file: 'waves.svg' });
    expect(inventoryCallCount()).toBe(2);
    expect(deleteButton.hasAttribute('disabled')).toBe(true);
    expect(invalidateByPrefix).toHaveBeenCalledWith('/api/backgrounds');
  });

  it('deletes one file from its tile button after the same confirm', async () => {
    await renderLoaded();
    select('waves.svg');
    fireEvent.click(within(tile('lake_sunset.jpg')).getByTestId('media-tile-delete'));

    await waitFor(() => expect(screen.queryByTestId('media-tile-lake_sunset.jpg')).toBeNull());
    expect(confirmState.ask.mock.calls[0][0]).toMatchObject({ variant: 'danger' });
    expect(deleteCalls()).toHaveLength(1);
    expect(JSON.parse(String(deleteCalls()[0][1]!.body))).toEqual({ file: 'lake_sunset.jpg' });
    // The batch selection is not what was deleted, and it is cleared with it.
    expect(screen.getByTestId('media-tile-waves.svg')).toBeTruthy();
    expect(screen.getByTestId('media-delete-button').hasAttribute('disabled')).toBe(true);
  });

  it('deletes from the viewer and closes it once the file is gone', async () => {
    await renderLoaded();
    openTile('lake_sunset.jpg');
    fireEvent.click(screen.getByTestId('media-viewer-delete'));

    await waitFor(() => expect(screen.queryByTestId('media-tile-lake_sunset.jpg')).toBeNull());
    expect(screen.queryByTestId('media-viewer')).toBeNull();
    expect(deleteCalls()).toHaveLength(1);
  });

  it('keeps a 409-refused file, drops the others, and names the refused file', async () => {
    mockApi(['waves.svg']);
    await renderLoaded();

    select('lake_sunset.jpg');
    select('waves.svg');
    fireEvent.click(screen.getByTestId('media-delete-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('media-tile-lake_sunset.jpg')).toBeNull();
    });
    expect(screen.getByTestId('media-tile-waves.svg')).toBeTruthy();
    const refused = screen.getByTestId('media-refused');
    expect(refused.textContent).toContain('waves.svg');
    expect(refused.textContent).not.toContain('lake_sunset.jpg');
    expect(screen.queryByTestId('media-delete-failed')).toBeNull();
  });

  it('reports a server failure instead of pretending the file went away', async () => {
    mockApi([], ['waves.svg']);
    await renderLoaded();

    select('waves.svg');
    fireEvent.click(screen.getByTestId('media-delete-button'));

    await waitFor(() => expect(screen.getByTestId('media-delete-failed')).toBeTruthy());
    expect(screen.getByTestId('media-delete-failed').textContent).toBe('failed:1');
    expect(screen.getByTestId('media-tile-waves.svg')).toBeTruthy();
    expect(invalidateByPrefix).not.toHaveBeenCalled();
  });
});

describe('MediaLibraryPage unused filter and storage', () => {
  it('shows only files nothing uses when the Unused chip is on, and counts follow it', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId('media-unused-only'));
    const paths = Array.from(document.querySelectorAll('[data-media-path]')).map((el) => el.getAttribute('data-media-path'));
    expect(paths).toEqual(['lake_sunset.jpg', 'nature/foggy_ridge.webp', 'nature/sledding.mov', 'waves.svg']);
    expect(screen.getByTestId('media-chip-all').querySelector('[data-count]')!.textContent).toBe('4');
    expect(screen.getByTestId('media-unused-only').getAttribute('aria-pressed')).toBe('true');
  });

  it('prints the library size and free space, and folder sizes on the chips', async () => {
    await renderLoaded();
    expect(screen.getByTestId('media-storage').textContent).toBe('uses 124 MB free 28 GB');
    expect(screen.getByTestId('media-chip-nature').getAttribute('title')).toBe('114 MB');
  });
});

describe('MediaLibraryPage missing files', () => {
  it('lists every dangling reference with a link into the editor', async () => {
    editorFetch.mockImplementation(async (url: string) => {
      if (url !== '/api/backgrounds/inventory') return jsonRes({});
      const inv = seedInventory();
      inv.missing = [
        { path: 'gone.jpg', kind: 'file', uses: [{ kind: 'screen', name: 'Porch', configPath: 'screens[2].backgroundImage', screenId: 's-porch' }] },
        { path: 'old-trips', kind: 'folder', uses: [{ kind: 'slideshow', name: 'Den', configPath: 'screens[1].modules[0].config.directory', screenId: 's-den', moduleId: 'm-slides' }] },
      ];
      return jsonRes(inv);
    });
    await renderLoaded();
    const banner = screen.getByTestId('media-missing');
    expect(banner.textContent).toContain('missing-file screen:Porch gone.jpg');
    expect(banner.textContent).toContain('missing-folder slideshow:Den old-trips');

    fireEvent.click(within(banner).getAllByTestId('media-used-by-link')[1]);
    expect(storeState.selectScreen).toHaveBeenCalledWith('s-den');
    expect(storeState.selectModule).toHaveBeenCalledWith('m-slides');
    expect(routerPush).toHaveBeenCalledWith('/editor?screen=s-den&module=m-slides');
  });

  it('shows no banner when nothing is missing', async () => {
    await renderLoaded();
    expect(screen.queryByTestId('media-missing')).toBeNull();
  });
});

describe('MediaLibraryPage open in the editor', () => {
  it('jumps to the display, screen and module a where-used line names', async () => {
    await renderLoaded();
    const popover = tile('clips/walk.mp4').querySelector('[data-used-by]')!;
    fireEvent.click(within(popover as HTMLElement).getByTestId('media-used-by-link'));
    expect(storeState.setSelectedDisplay).toHaveBeenCalledWith('d-den');
    expect(storeState.selectScreen).toHaveBeenCalledWith('s-den');
    expect(storeState.selectModule).toHaveBeenCalledWith('m-video');
    expect(routerPush).toHaveBeenCalledWith('/editor?display=d-den&screen=s-den&module=m-video');
  });

  it('does not switch displays when the use is already on the selected one', async () => {
    storeState.selectedDisplayId = 'd-den';
    await renderLoaded();
    openTile('clips/walk.mp4');
    fireEvent.click(within(screen.getByTestId('media-viewer-used-by')).getByTestId('media-used-by-link'));
    expect(storeState.setSelectedDisplay).not.toHaveBeenCalled();
    expect(storeState.selectScreen).toHaveBeenCalledWith('s-den');
  });
});

describe('MediaLibraryPage replace', () => {
  it('replaces a used file from its tile, keeping the name, and drops the canvas cache', async () => {
    await renderLoaded();
    const used = tile('nature/forest_morning.jpg');
    fireEvent.click(within(used).getByTestId('media-tile-replace'));
    const input = screen.getByTestId('media-replace-input') as HTMLInputElement;
    expect(input.accept).toBe('image/*');
    fireEvent.change(input, { target: { files: [new File(['new'], 'anything.jpg', { type: 'image/jpeg' })] } });

    await waitFor(() => expect(screen.getByTestId('media-outcome').textContent).toBe('replaced forest_morning.jpg'));
    const posts = editorFetch.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    const body = posts[0][1]!.body as FormData;
    expect(body.get('replace')).toBe('nature/forest_morning.jpg');
    expect((body.get('file') as File).name).toBe('anything.jpg');
    expect(invalidateByPrefix).toHaveBeenCalledWith('/api/backgrounds');
    expect(inventoryCallCount()).toBe(2);
  });

  it('replaces from the viewer and shows the server reason when refused', async () => {
    mockApi([], ['lake_sunset.jpg']);
    await renderLoaded();
    openTile('lake_sunset.jpg');
    const input = screen.getByTestId('media-viewer-replace-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['new'], 'wrong.png', { type: 'image/png' })] } });

    await waitFor(() => expect(screen.getByTestId('media-outcome').getAttribute('data-ok')).toBe('false'));
    expect(screen.getByTestId('media-outcome').textContent).toContain('needs to end in .jpg');
    expect(invalidateByPrefix).not.toHaveBeenCalled();
  });
});

describe('MediaViewer keyboard and focus', () => {
  it('moves focus into the viewer and gives it back to the tile on close', async () => {
    await renderLoaded();
    const opener = within(tile('lake_sunset.jpg')).getByTestId('media-tile-open');
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(screen.getByTestId('media-viewer')).toBeTruthy());
    expect(screen.getByTestId('media-viewer').contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('media-viewer')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('leaves arrow keys to a video that has focus', async () => {
    await renderLoaded();
    openTile('nature/sledding.mov');
    const video = screen.getByTestId('media-viewer-video');
    fireEvent.keyDown(video, { key: 'ArrowRight' });
    expect(screen.getByTestId('media-viewer-name').textContent).toBe('sledding.mov');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('media-viewer-name').textContent).not.toBe('sledding.mov');
  });
});

describe('MediaLibraryPage search, sort and selection', () => {
  const order = () => Array.from(document.querySelectorAll('[data-media-path]')).map((el) => el.getAttribute('data-media-path'));

  it('filters by a name fragment, case-insensitively, and counts follow', async () => {
    await renderLoaded();
    fireEvent.change(screen.getByTestId('media-search'), { target: { value: 'FOG' } });
    expect(order()).toEqual(['nature/foggy_ridge.webp']);
    expect(screen.getByTestId('media-chip-all').querySelector('[data-count]')!.textContent).toBe('1');
  });

  it('sorts by name, newest and largest', async () => {
    await renderLoaded();
    expect(order()[0]).toBe('clips/walk.mp4');
    fireEvent.change(screen.getByTestId('media-sort'), { target: { value: 'newest' } });
    expect(order()[0]).toBe('lake_sunset.jpg');
    fireEvent.change(screen.getByTestId('media-sort'), { target: { value: 'largest' } });
    expect(order()[0]).toBe('nature/sledding.mov');
  });

  it('selects everything visible, then clears, and shift-click picks a range in grid order', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId('media-chip-nature'));
    fireEvent.click(screen.getByTestId('media-select-all'));
    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(3);
    expect(screen.getByTestId('media-select-all').textContent).toBe('settings.mediaPage.clearSelection');
    fireEvent.click(screen.getByTestId('media-select-all'));
    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(0);

    fireEvent.click(screen.getByTestId('media-chip-all'));
    select('lake_sunset.jpg');
    fireEvent.click(tile('nature/sledding.mov').querySelector('input[type="checkbox"]')!, { shiftKey: true });
    expect(Array.from(document.querySelectorAll('[data-selected="true"]')).map((el) => el.getAttribute('data-media-path')))
      .toEqual(['lake_sunset.jpg', 'nature/foggy_ridge.webp', 'nature/forest_morning.jpg', 'nature/sledding.mov']);
  });
});

describe('MediaLibraryPage move', () => {
  it('moves the selection after a confirm, reports rewritten places, and refetches', async () => {
    libraryOps.move.mockResolvedValue({ ok: true, status: 200, data: { moved: [{ from: 'lake_sunset.jpg', to: 'nature/lake_sunset.jpg' }, { from: 'nature/forest_morning.jpg', to: 'nature/forest_morning.jpg' }], kept: [], rewritten: 1, revision: 'r1' } });
    await renderLoaded();
    const moveSelect = screen.getByTestId('media-move-select') as HTMLSelectElement;
    expect(moveSelect.disabled).toBe(true);
    select('lake_sunset.jpg');
    select('nature/forest_morning.jpg');
    expect(moveSelect.disabled).toBe(false);
    fireEvent.change(moveSelect, { target: { value: 'nature' } });

    await waitFor(() => expect(screen.getByTestId('media-outcome').textContent).toBe('moved:2 places:1'));
    expect(confirmState.ask).toHaveBeenCalledTimes(1);
    expect(libraryOps.move).toHaveBeenCalledWith(['lake_sunset.jpg', 'nature/forest_morning.jpg'], 'nature');
    expect(invalidateByPrefix).toHaveBeenCalledWith('/api/backgrounds');
    expect(inventoryCallCount()).toBe(2);
    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });

  it('maps the top-level option to an empty folder', async () => {
    libraryOps.move.mockResolvedValue({ ok: true, status: 200, data: { moved: [{ from: 'nature/foggy_ridge.webp', to: 'foggy_ridge.webp' }], kept: [], rewritten: 0, revision: 'r1' } });
    await renderLoaded();
    select('nature/foggy_ridge.webp');
    fireEvent.change(screen.getByTestId('media-move-select'), { target: { value: '__top__' } });
    await waitFor(() => expect(libraryOps.move).toHaveBeenCalledWith(['nature/foggy_ridge.webp'], ''));
  });

  it('hands the editor store the move, with the revision it was made from', async () => {
    // The store decides between a reload and an in-memory rewrite, and moves
    // onto the new revision only from the one the hub rewrote.
    libraryOps.move.mockResolvedValue({ ok: true, status: 200, data: { moved: [{ from: 'lake_sunset.jpg', to: 'nature/lake_sunset.jpg' }], kept: [], rewritten: 1, revision: 'r9', previousRevision: 'r8' } });
    await renderLoaded();
    select('lake_sunset.jpg');
    fireEvent.change(screen.getByTestId('media-move-select'), { target: { value: 'nature' } });
    await waitFor(() => expect(storeState.adoptHubRewrite).toHaveBeenCalledTimes(1));
    const change = storeState.adoptHubRewrite.mock.calls[0][0];
    expect(change.previousRevision).toBe('r8');
    expect(change.revision).toBe('r9');
    expect(change.rewrite({ screens: [{ id: 's1', backgroundImage: 'lake_sunset.jpg' }] }))
      .toEqual({ screens: [{ id: 's1', backgroundImage: 'nature/lake_sunset.jpg' }] });
  });

  it('shows the refusal in its own words when a move is refused and keeps the selection', async () => {
    libraryOps.move.mockResolvedValue({ ok: false, status: 409, error: 'HUB SENTENCE', code: 'library.fileExists', params: { name: 'lake_sunset.jpg' } });
    await renderLoaded();
    select('lake_sunset.jpg');
    fireEvent.change(screen.getByTestId('media-move-select'), { target: { value: 'nature' } });
    await waitFor(() => expect(screen.getByTestId('media-outcome').getAttribute('data-ok')).toBe('false'));
    expect(screen.getByTestId('media-outcome').textContent).toBe('lake_sunset.jpg already in that folder');
    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(1);
  });
});

describe('MediaLibraryPage folders', () => {
  it('creates a folder under the one being viewed and jumps to it', async () => {
    libraryOps.createFolder.mockResolvedValue({ ok: true, status: 201, data: { path: 'nature/kids' } });
    await renderLoaded();
    fireEvent.click(screen.getByTestId('media-chip-nature'));
    fireEvent.click(screen.getByTestId('media-folder-create'));
    fireEvent.change(screen.getByTestId('media-folder-name'), { target: { value: 'kids' } });
    fireEvent.click(screen.getByTestId('media-folder-submit'));

    await waitFor(() => expect(screen.getByTestId('media-outcome').textContent).toBe('created nature/kids'));
    expect(libraryOps.createFolder).toHaveBeenCalledWith('kids', 'nature');
    expect(screen.queryByTestId('media-folder-form')).toBeNull();
    expect(inventoryCallCount()).toBe(2);
  });

  it('renames the viewed folder and follows it', async () => {
    libraryOps.renameFolder.mockResolvedValue({ ok: true, status: 200, data: { from: 'nature', to: 'outdoors', rewritten: 2, revision: 'r2' } });
    await renderLoaded();
    expect(screen.queryByTestId('media-folder-rename')).toBeNull();
    fireEvent.click(screen.getByTestId('media-chip-nature'));
    fireEvent.click(screen.getByTestId('media-folder-rename'));
    expect((screen.getByTestId('media-folder-name') as HTMLInputElement).value).toBe('nature');
    fireEvent.change(screen.getByTestId('media-folder-name'), { target: { value: 'outdoors' } });
    fireEvent.click(screen.getByTestId('media-folder-submit'));

    await waitFor(() => expect(screen.getByTestId('media-outcome').textContent).toBe('renamed outdoors places:2'));
    expect(libraryOps.renameFolder).toHaveBeenCalledWith('nature', 'outdoors');
    expect(screen.getByTestId('media-chip-all').getAttribute('aria-pressed')).toBe('false');
  });

  it('deletes an empty folder after a confirm and explains a full one', async () => {
    libraryOps.deleteFolder.mockResolvedValueOnce({ ok: false, status: 409, error: 'Directory is not empty. Delete all photos first.', code: 'library.folderNotEmpty' });
    await renderLoaded();
    fireEvent.click(screen.getByTestId('media-chip-clips'));
    fireEvent.click(screen.getByTestId('media-folder-delete'));
    await waitFor(() => expect(screen.getByTestId('media-outcome').textContent).toBe('not-empty'));
    expect(confirmState.ask.mock.calls[0][0]).toMatchObject({ variant: 'danger' });

    libraryOps.deleteFolder.mockResolvedValueOnce({ ok: true, status: 200, data: { deleted: 'clips' } });
    fireEvent.click(screen.getByTestId('media-folder-delete'));
    await waitFor(() => expect(screen.getByTestId('media-outcome').textContent).toBe('deleted clips'));
    expect(screen.getByTestId('media-chip-all').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('MediaLibraryPage upload', () => {
  it('posts every picked file and the chosen directory in one request, then refetches', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByTestId('media-upload-button'));
    const panel = screen.getByTestId('media-upload-panel');
    fireEvent.change(panel.querySelector('[data-upload-directory]')!, { target: { value: 'nature' } });

    const files = [
      new File(['aaaa'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['bbbb'], 'b.png', { type: 'image/png' }),
    ];
    fireEvent.change(panel.querySelector('[data-file-input]')!, { target: { files } });

    await waitFor(() => expect(inventoryCallCount()).toBe(2));
    const posts = editorFetch.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    const [url, init] = posts[0];
    expect(url).toBe('/api/backgrounds');
    expect(init!.body).toBeInstanceOf(FormData);
    const body = init!.body as FormData;
    expect(body.getAll('file').map((f) => (f as File).name)).toEqual(['a.jpg', 'b.png']);
    expect(body.get('directory')).toBe('nature');
    // The panel closes on success and the canvas cache is dropped.
    expect(screen.queryByTestId('media-upload-panel')).toBeNull();
    expect(invalidateByPrefix).toHaveBeenCalledWith('/api/backgrounds');
  });

  it('surfaces the server error inline and keeps the panel open on failure', async () => {
    await renderLoaded();
    editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonRes({ error: 'Invalid file type: c.gif' }, 400);
      if (url === '/api/backgrounds/inventory') return jsonRes(seedInventory());
      return jsonRes({});
    });

    fireEvent.click(screen.getByTestId('media-upload-button'));
    const panel = screen.getByTestId('media-upload-panel');
    fireEvent.change(panel.querySelector('[data-file-input]')!, {
      target: { files: [new File(['cccc'], 'c.gif', { type: 'image/gif' })] },
    });

    await waitFor(() => expect(screen.getByTestId('media-upload-error').textContent).toContain('c.gif'));
    expect(screen.getByTestId('media-upload-panel')).toBeTruthy();
    expect(inventoryCallCount()).toBe(1);
    expect(invalidateByPrefix).not.toHaveBeenCalled();
  });
});

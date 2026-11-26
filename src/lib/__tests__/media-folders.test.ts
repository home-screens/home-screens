import { describe, it, expect } from 'vitest';
import { photoFolders, wallName, wallsShowing } from '../media-folders';
import type { MediaInventoryDirectory, MediaInventoryItem } from '../media-inventory';
import type { SlideshowFolder } from '../media-usage';
import type { SlideshowMediaTypes } from '@/types/config';

const image = (path: string): MediaInventoryItem => ({ path, kind: 'image', bytes: 1, mtimeMs: 0 });
const video = (path: string): MediaInventoryItem => ({ path, kind: 'video', bytes: 1, mtimeMs: 0 });
const dir = (path: string): MediaInventoryDirectory => ({ name: path.slice(path.lastIndexOf('/') + 1), path });

/** A slideshow on a screen named `screen`, on a display named `display` when given. */
function slideshow(
  folder: string,
  screen: string | undefined,
  { shows = 'photos', display }: { shows?: SlideshowMediaTypes; display?: string } = {},
): SlideshowFolder {
  return {
    folder,
    shows,
    use: {
      kind: 'slideshow',
      name: screen,
      configPath: 'displays[0].screens[0].modules[0].config.directory',
      ...(display ? { displayId: display.toLowerCase() } : {}),
      screenId: 's1',
    },
    ...(display ? { displayName: display } : {}),
  };
}

// Listed out of order on purpose: the rest are sorted by path.
const directories = [
  dir('Trips/Utah'),
  dir('Favorites'),
  dir('Trips'),
  dir('Birthdays'),
  dir('Trips/Colorado-2025'),
  dir('Aquarium'),
];
const items = [
  image('top.jpg'),
  image('Favorites/a.jpg'),
  image('Favorites/b.png'),
  video('Favorites/clip.mp4'),
  image('Trips/Colorado-2025/peak.jpg'),
  video('Trips/Colorado-2025/river.mov'),
  image('Birthdays/cake.jpg'),
];

const paths = (slideshows: SlideshowFolder[], keep?: string, library = items) =>
  photoFolders(library, directories, slideshows, keep).map((f) => f.path);

describe('photoFolders', () => {
  it('puts the folders a wall shows first, once each in wall order, then the top level, then the rest by path', () => {
    const walls = [
      slideshow('Trips/Colorado-2025', 'Kitchen'),
      slideshow('Favorites', 'Hall'),
      slideshow('Trips/Colorado-2025', 'Den'),
    ];
    expect(paths(walls)).toEqual(['Trips/Colorado-2025', 'Favorites', '', 'Aquarium', 'Birthdays', 'Trips/Utah']);
  });

  it('keeps the top level in its wall position when a wall shows it', () => {
    const walls = [slideshow('Favorites', 'Hall'), slideshow('', 'Den'), slideshow('Birthdays', 'Kitchen')];
    expect(paths(walls)).toEqual(['Favorites', '', 'Birthdays', 'Aquarium', 'Trips/Colorado-2025', 'Trips/Utah']);
  });

  it('counts the pictures and videos directly inside each folder, not deeper', () => {
    const byPath = new Map(photoFolders(items, directories, []).map((f) => [f.path, f]));
    expect(byPath.get('')).toMatchObject({ images: 1, videos: 0 });
    expect(byPath.get('Favorites')).toMatchObject({ images: 2, videos: 1 });
    expect(byPath.get('Trips/Colorado-2025')).toMatchObject({ images: 1, videos: 1 });
    expect(byPath.get('Aquarium')).toMatchObject({ images: 0, videos: 0 });
  });

  it('marks the folders a slideshow shows as on a wall', () => {
    const folders = photoFolders(items, directories, [slideshow('Favorites', 'Hall')]);
    expect(folders.filter((f) => f.onWall).map((f) => f.path)).toEqual(['Favorites']);
    expect(folders.every((f) => f.exists)).toBe(true);
  });

  it('lists a folder a slideshow plays before anyone has made it, first, so a picture can go there', () => {
    // The Photo Frame template names "photos", which no library has until something is put in it.
    const folders = photoFolders(items, directories, [slideshow('photos', 'Photo Frame')]);
    expect(folders[0]).toEqual({
      path: 'photos',
      name: 'photos',
      parent: '',
      onWall: true,
      exists: false,
      images: 0,
      videos: 0,
      hasSubfolders: false,
    });
    expect(folders.slice(1)).toEqual(photoFolders(items, directories, []));
  });

  it('lists a not-yet-made folder inside another not-yet-made one under its whole path', () => {
    const folders = photoFolders([], [], [slideshow('Family/Frame', 'Hall')]);
    expect(folders.map((f) => [f.path, f.parent, f.exists])).toEqual([['Family/Frame', 'Family', false], ['', '', true]]);
  });

  it('splits a nested path into the folder it sits in and its own name', () => {
    const byPath = new Map(photoFolders(items, directories, []).map((f) => [f.path, f]));
    expect(byPath.get('Trips/Colorado-2025')).toEqual({
      path: 'Trips/Colorado-2025',
      name: 'Colorado-2025',
      parent: 'Trips',
      onWall: false,
      exists: true,
      images: 1,
      videos: 1,
      hasSubfolders: false,
    });
    expect(byPath.get('Favorites')).toMatchObject({ name: 'Favorites', parent: '' });
    expect(byPath.get('')).toMatchObject({ name: '', parent: '', hasSubfolders: true });
  });

  it('leaves out a folder that holds only other folders, unless a wall shows it or it is the one open', () => {
    expect(paths([])).not.toContain('Trips');
    expect(paths([slideshow('Trips', 'Hall')])[0]).toBe('Trips');

    const kept = photoFolders(items, directories, [], 'Trips').find((f) => f.path === 'Trips');
    // The pictures in Trips/Colorado-2025 are not Trips' own.
    expect(kept).toMatchObject({ images: 0, videos: 0, hasSubfolders: true });

    // It comes back once it holds a picture of its own.
    expect(paths([], undefined, [...items, image('Trips/map.png')])).toContain('Trips');
    // An empty folder with nothing inside it stays: a new picture can go there.
    expect(paths([])).toContain('Aquarium');
  });

  it('always lists the top level', () => {
    expect(photoFolders([], [], [])).toEqual([
      { path: '', name: '', parent: '', onWall: false, exists: true, images: 0, videos: 0, hasSubfolders: false },
    ]);
    // Even when it holds nothing but folders.
    expect(paths([], undefined, items.filter((i) => i.path !== 'top.jpg'))[0]).toBe('');
  });
});

describe('wallName', () => {
  const kitchen = slideshow('Favorites', 'Family photos', { display: 'Kitchen' });

  it('is the display when there are several', () => {
    expect(wallName(kitchen, true)).toBe('Kitchen');
  });

  it('is the screen when there is one display', () => {
    expect(wallName(kitchen, false)).toBe('Family photos');
  });

  it('falls back to the screen when the display has no name', () => {
    expect(wallName(slideshow('Favorites', 'Family photos'), true)).toBe('Family photos');
  });

  it('is undefined for a nameless screen on the lone display', () => {
    expect(wallName(slideshow('Favorites', undefined), false)).toBeUndefined();
  });
});

describe('wallsShowing', () => {
  const slideshows = [
    slideshow('Favorites', 'Family photos', { display: 'Kitchen' }),
    slideshow('Birthdays', 'Party', { display: 'Hallway' }),
    slideshow('Favorites', 'Welcome', { display: 'Hallway' }),
    slideshow('Favorites', 'Evening', { display: 'Kitchen' }),
  ];

  it('names each wall that plays the folder once, in config order', () => {
    expect(wallsShowing('Favorites', slideshows, true, 'A wall')).toEqual(['Kitchen', 'Hallway']);
    expect(wallsShowing('Favorites', slideshows, false, 'A wall')).toEqual(['Family photos', 'Welcome', 'Evening']);
    expect(wallsShowing('Trips', slideshows, true, 'A wall')).toEqual([]);
  });

  it('calls a nameless screen by the fallback, once', () => {
    const nameless = [slideshow('', undefined), slideshow('', 'Hall'), slideshow('', undefined)];
    expect(wallsShowing('', nameless, false, 'A wall')).toEqual(['A wall', 'Hall']);
  });

  it('with kinds, keeps only the slideshows that play one of them', () => {
    const mixed = [
      slideshow('Trip', 'Photos only', { shows: 'photos' }),
      slideshow('Trip', 'Videos only', { shows: 'videos' }),
      slideshow('Trip', 'Everything', { shows: 'both' }),
    ];
    expect(wallsShowing('Trip', mixed, false, 'A wall', ['image'])).toEqual(['Photos only', 'Everything']);
    expect(wallsShowing('Trip', mixed, false, 'A wall', ['video'])).toEqual(['Videos only', 'Everything']);
    expect(wallsShowing('Trip', mixed, false, 'A wall', ['image', 'video'])).toEqual(['Photos only', 'Videos only', 'Everything']);
    expect(wallsShowing('Trip', mixed, false, 'A wall')).toEqual(['Photos only', 'Videos only', 'Everything']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  parsePictureBackupChoice,
  pictureBackupSet,
  pictureBackupSummary,
  pictureEntryPath,
  pictureEntryProblem,
  planPictureWrites,
} from '../backup-pictures';
import { MAX_IMPORT_IMAGE_BYTES, MAX_VIDEO_BYTES } from '../media-formats';
import type { MediaInventoryItem } from '../media-inventory';

function item(path: string, bytes = 100): MediaInventoryItem {
  return { path, kind: /\.(mp4|webm|mov)$/i.test(path) ? 'video' : 'image', bytes, mtimeMs: 0 };
}

/** A screen background, a day rule, a photos-only slideshow of `trips`, a
 *  video module, and a reference to a file that is not in the library. */
const config = {
  screens: [
    {
      id: 's1', name: 'Kitchen', backgroundImage: '/api/backgrounds/serve?file=kitchen.jpg',
      modules: [
        { id: 'm1', type: 'photo-slideshow', config: { photoSource: { kind: 'library', folder: 'trips' }, mediaTypes: 'photos' } },
        { id: 'm2', type: 'video', config: { file: 'clips/intro.mp4' } },
      ],
    },
  ],
  settings: { dayRules: [{ backgroundImage: '/backgrounds/holiday.png' }] },
  stray: { backgroundImage: 'gone.jpg' },
};

const library = [
  item('kitchen.jpg', 10),
  item('holiday.png', 20),
  item('trips/a.jpg', 30),
  item('trips/b.jpg', 40),
  item('trips/movie.mp4', 500),
  item('clips/intro.mp4', 600),
  item('unused.jpg', 7),
];

describe('pictureBackupSet', () => {
  it('"used" is every file the config points at, slideshow folders filtered by what they play', () => {
    expect(pictureBackupSet('used', config, library).map((i) => i.path)).toEqual([
      'clips/intro.mp4', 'holiday.png', 'kitchen.jpg', 'trips/a.jpg', 'trips/b.jpg',
    ]);
  });
  it('"all" is the whole library, sorted by path', () => {
    expect(pictureBackupSet('all', config, library).map((i) => i.path)).toEqual([
      'clips/intro.mp4', 'holiday.png', 'kitchen.jpg', 'trips/a.jpg', 'trips/b.jpg', 'trips/movie.mp4', 'unused.jpg',
    ]);
  });
});

describe('pictureBackupSummary', () => {
  it('counts and sizes both sets and the references that point at nothing', () => {
    const summary = pictureBackupSummary(config, { items: library, directories: [{ name: 'trips', path: 'trips' }, { name: 'clips', path: 'clips' }] });
    expect(summary.used).toEqual({ count: 5, bytes: 10 + 20 + 30 + 40 + 600 });
    expect(summary.all).toEqual({ count: 7, bytes: 1207 });
    expect(summary.missing).toBe(1);
  });
});

describe('parsePictureBackupChoice', () => {
  it('accepts the three choices and nothing else', () => {
    expect(parsePictureBackupChoice('used')).toBe('used');
    expect(parsePictureBackupChoice('all')).toBe('all');
    expect(parsePictureBackupChoice('off')).toBe('off');
    expect(parsePictureBackupChoice('everything')).toBeNull();
    expect(parsePictureBackupChoice(1)).toBeNull();
  });
});

describe('pictureEntryPath', () => {
  it('maps a pictures/ entry to its library path', () => {
    expect(pictureEntryPath('pictures/kitchen.jpg')).toBe('kitchen.jpg');
    expect(pictureEntryPath('pictures/trips/2025/a.JPG')).toBe('trips/2025/a.JPG');
    expect(pictureEntryPath('pictures/my photo.png')).toBe('my photo.png');
  });
  it('is null for anything that is not a picture of ours', () => {
    expect(pictureEntryPath('backup.json')).toBeNull();
    expect(pictureEntryPath('pictures/')).toBeNull();
    expect(pictureEntryPath('pictures/../data/config.json')).toBeNull();
    expect(pictureEntryPath('pictures/trips/../../x.jpg')).toBeNull();
    expect(pictureEntryPath('pictures//etc/x.jpg')).toBeNull();
    expect(pictureEntryPath('pictures/a\\b.jpg')).toBeNull();
    expect(pictureEntryPath('pictures/a/b/c/d.jpg')).toBeNull();
    expect(pictureEntryPath('pictures/x.jpg.tmp')).toBeNull();
    expect(pictureEntryPath('pictures/run.exe')).toBeNull();
    expect(pictureEntryPath('pictures/rotation-unsplash-abc.jpg')).toBeNull();
    expect(pictureEntryPath('pictures/trips/rotation-abc.jpg')).toBe('trips/rotation-abc.jpg');
  });
});

describe('pictureEntryProblem', () => {
  const never = () => Promise.reject(new Error('not asked'));
  it('holds pictures and videos to the import caps', async () => {
    expect(await pictureEntryProblem('a.jpg', MAX_IMPORT_IMAGE_BYTES, never)).toBeNull();
    expect(await pictureEntryProblem('a.jpg', MAX_IMPORT_IMAGE_BYTES + 1, never)).toMatch(/bigger than a picture/);
    expect(await pictureEntryProblem('a.mp4', MAX_VIDEO_BYTES, never)).toBeNull();
    expect(await pictureEntryProblem('a.mp4', MAX_VIDEO_BYTES + 1, never)).toMatch(/bigger than a video/);
  });
  it('asks an SVG for its size', async () => {
    expect(await pictureEntryProblem('a.svg', 10, async () => '<svg viewBox="0 0 10 10"/>')).toBeNull();
    expect(await pictureEntryProblem('a.svg', 10, async () => '<svg/>')).toMatch(/no size information/);
  });
});

describe('planPictureWrites', () => {
  it('adds, keeps a same-size file, replaces a different one, and needs only the bytes it writes', () => {
    const plan = planPictureWrites(
      [{ libraryPath: 'new.jpg', bytes: 10 }, { libraryPath: 'same.jpg', bytes: 20 }, { libraryPath: 'changed.jpg', bytes: 30 }],
      new Map([['same.jpg', 20], ['changed.jpg', 31]]),
    );
    expect(plan.writes.map((w) => w.action)).toEqual(['add', 'keep', 'replace']);
    expect(plan.bytesNeeded).toBe(40);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

vi.mock('@/lib/icloud-album', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/icloud-album')>();
  return {
    ...actual,
    fetchSharedStreamsAlbum: vi.fn(),
  };
});

vi.mock('@/lib/icloud-link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/icloud-link')>();
  return {
    ...actual,
    listICloudLinkItems: vi.fn(),
    fetchCloudKitAlbum: vi.fn(),
  };
});

import { fetchWithTimeout } from '@/lib/api-utils';
import { fetchSharedStreamsAlbum } from '@/lib/icloud-album';
import { listICloudLinkItems, fetchCloudKitAlbum } from '@/lib/icloud-link';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import {
  clearICloudImportJobs,
  getICloudImport,
  startICloudImport,
  type ICloudImportJob,
} from '@/lib/icloud-import';
import { detectICloudSource } from '@/lib/icloud-parse';

const mockFetch = vi.mocked(fetchWithTimeout);
const mockAlbum = vi.mocked(fetchSharedStreamsAlbum);
const mockLink = vi.mocked(listICloudLinkItems);
const mockCloudKit = vi.mocked(fetchCloudKitAlbum);

const ALBUM_URL = 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC';
const NEW_ALBUM_URL = 'https://photos.icloud.com/shared/album/03c4SA2q7HwyPw7YOwfXTn0mg';
const LINK_URL = 'https://share.icloud.com/photos/0f0a3hdUxHZ0-C8uQ7Dq1JxLw';

// The vitest sandbox chdirs each test file into an isolated cwd with an empty
// data/, so real fs writes here never touch the repo's library.
const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

function mediaResponse(contentType: string, body = 'bytes') {
  return new Response(body, { status: 200, headers: { 'Content-Type': contentType } });
}

async function waitForFinished(jobId: string): Promise<ICloudImportJob> {
  await vi.waitFor(() => {
    const job = getICloudImport(jobId);
    expect(job && job.state !== 'running').toBe(true);
  });
  return getICloudImport(jobId)!;
}

// Every test imports into one of these named folders — never the library
// root — and cleanup removes ONLY them. Do not "simplify" this to an
// fs.rm of BGS itself: an unscoped recursive rm of the library root is what
// wiped the real public/backgrounds on 2026-07-09 (through the then-symlinked
// sandbox public/), and folder-scoped cleanup keeps that class of accident
// impossible even if the sandbox regresses.
const TEST_FOLDERS = ['family', 'clips', 'fails', 'empty', 'busy'];

beforeEach(async () => {
  vi.clearAllMocks();
  clearICloudImportJobs();
  for (const folder of TEST_FOLDERS) {
    await fs.rm(path.join(BGS, folder), { recursive: true, force: true });
  }
});

describe('detectICloudSource', () => {
  it('classifies shared album links and bare album tokens', () => {
    expect(detectICloudSource(ALBUM_URL)).toBe('album');
    expect(detectICloudSource('B125ON9t3mbLNC')).toBe('album');
  });

  it('classifies iCloud Links and their bare short GUIDs', () => {
    expect(detectICloudSource(LINK_URL)).toBe('link');
    expect(detectICloudSource('https://www.icloud.com/photos/#/icloudlinks/0f0a3hdUxHZ0-C8uQ7Dq1JxLw')).toBe('link');
    expect(detectICloudSource('0f0a3hdUxHZ0-C8uQ7Dq1JxLw')).toBe('link');
  });

  it('rejects everything else', () => {
    expect(detectICloudSource('https://example.com/photos')).toBeNull();
    expect(detectICloudSource('')).toBeNull();
  });

  it('does not classify extensionless direct-media URLs as iCloud Links', () => {
    // Without the bare-token guard, the last path segment matches the
    // short-GUID regex and the editor would hide the normal Video URL field.
    expect(detectICloudSource('https://cdn.example.com/media/abc123def456')).toBeNull();
    expect(detectICloudSource('example.com/watch_this-clip99')).toBeNull();
  });
});

describe('startICloudImport — shared albums', () => {
  it('downloads every album item with extensions from Content-Type', async () => {
    mockAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/a', type: 'image', guid: 'photo-1' },
      { url: 'https://cvws.icloud-content.com/b', type: 'video', guid: 'video-1' },
    ]);
    mockFetch.mockImplementation(async (url) =>
      String(url).endsWith('/b') ? mediaResponse('video/mp4') : mediaResponse('image/jpeg'));

    const started = await startICloudImport(ALBUM_URL, 'family');
    if ('error' in started) throw new Error(started.error);
    expect(started.total).toBe(2);

    const job = await waitForFinished(started.jobId);
    expect(job).toMatchObject({ state: 'done', done: 2, skipped: 0, failed: 0 });
    // Videos report their library-relative path; photos don't.
    expect(job.videoFiles).toEqual(['family/icloud-video-1.mp4']);

    const files = (await fs.readdir(path.join(BGS, 'family'))).sort();
    expect(files).toEqual(['icloud-photo-1.jpg', 'icloud-video-1.mp4']);
  });

  it('skips items that already exist locally (re-import dedup)', async () => {
    await fs.mkdir(path.join(BGS, 'family'), { recursive: true });
    await fs.writeFile(path.join(BGS, 'family', 'icloud-photo-1.jpg'), 'old');

    mockAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/a', type: 'image', guid: 'photo-1' },
      { url: 'https://cvws.icloud-content.com/c', type: 'image', guid: 'photo-2' },
    ]);
    mockFetch.mockResolvedValue(mediaResponse('image/jpeg'));

    const started = await startICloudImport(ALBUM_URL, 'family');
    if ('error' in started) throw new Error(started.error);
    const job = await waitForFinished(started.jobId);

    expect(job).toMatchObject({ done: 1, skipped: 1, failed: 0 });
    // The pre-existing file was not overwritten.
    expect(await fs.readFile(path.join(BGS, 'family', 'icloud-photo-1.jpg'), 'utf-8')).toBe('old');
  });

  it('counts failed downloads without failing the job', async () => {
    mockAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/ok', type: 'image', guid: 'ok' },
      { url: 'https://cvws.icloud-content.com/gone', type: 'image', guid: 'gone' },
    ]);
    mockFetch.mockImplementation(async (url) =>
      String(url).endsWith('/gone') ? new Response('', { status: 410 }) : mediaResponse('image/jpeg'));

    const started = await startICloudImport(ALBUM_URL, 'fails');
    if ('error' in started) throw new Error(started.error);
    const job = await waitForFinished(started.jobId);

    expect(job).toMatchObject({ state: 'done', done: 1, failed: 1 });
  });

  it('finishes immediately for an empty album', async () => {
    mockAlbum.mockResolvedValue([]);

    const started = await startICloudImport(ALBUM_URL, 'empty');
    if ('error' in started) throw new Error(started.error);
    expect(started.total).toBe(0);
    expect(getICloudImport(started.jobId)?.state).toBe('done');
  });
});

describe('startICloudImport — new-format shared albums (CloudKit)', () => {
  it('imports a photos.icloud.com/shared/album link through the CloudKit backend', async () => {
    mockCloudKit.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/a', type: 'image', guid: 'ck-photo' },
      { url: 'https://cvws.icloud-content.com/b', type: 'video', guid: 'ck-video' },
    ]);
    mockFetch.mockImplementation(async (url) =>
      String(url).endsWith('/b') ? mediaResponse('video/mp4') : mediaResponse('image/jpeg'));

    const started = await startICloudImport(NEW_ALBUM_URL, 'family');
    if ('error' in started) throw new Error(started.error);
    expect(started.total).toBe(2);

    const job = await waitForFinished(started.jobId);
    expect(job).toMatchObject({ state: 'done', done: 2, skipped: 0, failed: 0 });
    expect(job.videoFiles).toEqual(['family/icloud-ck-video.mp4']);

    expect(mockCloudKit).toHaveBeenCalledWith('03c4SA2q7HwyPw7YOwfXTn0mg');
    expect(mockAlbum).not.toHaveBeenCalled();
    const files = (await fs.readdir(path.join(BGS, 'family'))).sort();
    expect(files).toEqual(['icloud-ck-photo.jpg', 'icloud-ck-video.mp4']);
  });

  it('imports nothing (without erroring) when the new-format album is private or expired', async () => {
    // The CloudKit backend reports missing/private as null; the dispatcher
    // maps it to [], which imports as an empty album rather than a hard error.
    mockCloudKit.mockResolvedValue(null);

    const started = await startICloudImport(NEW_ALBUM_URL, 'empty');
    if ('error' in started) throw new Error(started.error);
    expect(started.total).toBe(0);
    expect(getICloudImport(started.jobId)?.state).toBe('done');
  });
});

describe('startICloudImport — iCloud Links', () => {
  it('downloads link items under their pre-computed filenames', async () => {
    mockLink.mockResolvedValue([
      { downloadUrl: 'https://cvws.icloud-content.com/v', type: 'video', filename: 'IMG_0333-AXaxFKq1.mp4', size: 1 },
    ]);
    mockFetch.mockResolvedValue(mediaResponse('application/octet-stream'));

    const started = await startICloudImport(LINK_URL, 'clips');
    if ('error' in started) throw new Error(started.error);
    const job = await waitForFinished(started.jobId);

    expect(job).toMatchObject({ state: 'done', done: 1 });
    expect(job.videoFiles).toEqual(['clips/IMG_0333-AXaxFKq1.mp4']);
    expect(await fs.readdir(path.join(BGS, 'clips'))).toEqual(['IMG_0333-AXaxFKq1.mp4']);
  });

  it('includes already-present videos in videoFiles so re-imports can still auto-select', async () => {
    await fs.mkdir(path.join(BGS, 'clips'), { recursive: true });
    await fs.writeFile(path.join(BGS, 'clips', 'IMG_0333-AXaxFKq1.mp4'), 'old');

    mockLink.mockResolvedValue([
      { downloadUrl: 'https://cvws.icloud-content.com/v', type: 'video', filename: 'IMG_0333-AXaxFKq1.mp4', size: 1 },
    ]);

    const started = await startICloudImport(LINK_URL, 'clips');
    if ('error' in started) throw new Error(started.error);
    const job = await waitForFinished(started.jobId);

    expect(job).toMatchObject({ state: 'done', done: 0, skipped: 1 });
    expect(job.videoFiles).toEqual(['clips/IMG_0333-AXaxFKq1.mp4']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports link-expired when the link no longer resolves', async () => {
    mockLink.mockResolvedValue(null);
    expect(await startICloudImport(LINK_URL, 'clips')).toEqual({ error: 'link-expired' });
  });
});

describe('startICloudImport — guards', () => {
  it('rejects unrecognized links', async () => {
    expect(await startICloudImport('https://example.com/nope', 'busy')).toEqual({ error: 'invalid-link' });
    expect(mockAlbum).not.toHaveBeenCalled();
    expect(mockLink).not.toHaveBeenCalled();
  });

  it('rejects folder paths that escape the library', async () => {
    expect(await startICloudImport(ALBUM_URL, '../../etc')).toEqual({ error: 'invalid-folder' });
  });

  it('refuses to start while another import is running', async () => {
    mockAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/slow', type: 'image', guid: 'slow' },
    ]);
    let release!: (r: Response) => void;
    mockFetch.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    const first = await startICloudImport(ALBUM_URL, 'busy');
    if ('error' in first) throw new Error(first.error);

    expect(await startICloudImport(ALBUM_URL, 'busy')).toEqual({ error: 'busy' });

    release(mediaResponse('image/jpeg'));
    await waitForFinished(first.jobId);
  });

  it('reserves the lock before the listing await, so simultaneous starts cannot both run', async () => {
    // The album listing takes 15-30s of network I/O in real life. Leave it
    // unresolved so the second start arrives mid-listing — before this fix,
    // both passed the busy check and ran concurrently.
    let releaseListing!: (items: Awaited<ReturnType<typeof fetchSharedStreamsAlbum>>) => void;
    mockAlbum.mockReturnValue(new Promise((resolve) => { releaseListing = resolve; }));

    const firstPromise = startICloudImport(ALBUM_URL, 'busy');
    expect(await startICloudImport(ALBUM_URL, 'busy')).toEqual({ error: 'busy' });

    releaseListing([]);
    const first = await firstPromise;
    if ('error' in first) throw new Error(first.error);
    expect(first.total).toBe(0);
  });

  it('releases the lock when the listing fails, so the next import can start', async () => {
    mockLink.mockResolvedValueOnce(null);
    expect(await startICloudImport(LINK_URL, 'clips')).toEqual({ error: 'link-expired' });

    mockLink.mockRejectedValueOnce(new Error('apple outage'));
    await expect(startICloudImport(LINK_URL, 'clips')).rejects.toThrow('apple outage');

    mockAlbum.mockResolvedValue([]);
    const started = await startICloudImport(ALBUM_URL, 'empty');
    expect('jobId' in started).toBe(true);
  });

  it('rejects imports with more items than the ceiling', async () => {
    mockAlbum.mockResolvedValue(Array.from({ length: 2001 }, (_, i) => ({
      url: `https://cvws.icloud-content.com/${i}`,
      type: 'image' as const,
      guid: `photo-${i}`,
    })));

    expect(await startICloudImport(ALBUM_URL, 'busy')).toEqual({ error: 'too-many-items' });
    expect(mockFetch).not.toHaveBeenCalled();

    // The rejected attempt must not leave the lock held.
    mockAlbum.mockResolvedValue([]);
    expect('jobId' in await startICloudImport(ALBUM_URL, 'empty')).toBe(true);
  });

  it('counts downloads from non-Apple hosts as failed without fetching them', async () => {
    mockAlbum.mockResolvedValue([
      { url: 'https://evil.example.com/a', type: 'image', guid: 'evil' },
      { url: 'https://cvws.icloud-content.com/ok', type: 'image', guid: 'ok' },
    ]);
    mockFetch.mockResolvedValue(mediaResponse('image/jpeg'));

    const started = await startICloudImport(ALBUM_URL, 'fails');
    if ('error' in started) throw new Error(started.error);
    const job = await waitForFinished(started.jobId);

    expect(job).toMatchObject({ state: 'done', done: 1, failed: 1 });
    expect(mockFetch.mock.calls.every(([u]) => !String(u).includes('evil.example.com'))).toBe(true);
  });

  it('returns null for unknown job ids', () => {
    expect(getICloudImport('nope')).toBeNull();
  });
});

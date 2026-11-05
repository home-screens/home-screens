import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock auth to be a no-op for all tests. `mediaSecret` lets media-list tests
// flip token minting on (auth enabled) without real auth state.
const authState = vi.hoisted(() => ({ mediaSecret: null as string | null }));

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
  getMediaTokenSecret: vi.fn(async () => authState.mediaSecret),
}));

// Hoisted config holder (the inventory-route.test.ts convention): each test
// re-imports the route after vi.resetModules(), which re-runs this factory
// into a fresh registry; the DELETE in-use scan reads configState.config at
// call time, so per-test seeding survives that.
const configState = vi.hoisted(() => ({ config: {} as unknown }));

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(async () => configState.config),
  // The delete runs its check and unlink inside the queued update; an
  // unchanged config back means nothing is written.
  updateConfigAtomic: vi.fn(async (mutator: (c: unknown) => unknown) => mutator(configState.config)),
}));

let tmpDir: string;
let origCwd: () => string;
let bgsDir: string;

beforeEach(async () => {
  authState.mediaSecret = null;
  configState.config = {};
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bg-route-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  bgsDir = path.join(tmpDir, 'public', 'backgrounds');
  await fs.mkdir(bgsDir, { recursive: true });
  // Reset modules so BGS is recomputed with the new cwd
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Import fresh each test so BGS picks up the overridden process.cwd() */
async function getHandlers() {
  return import('@/app/api/backgrounds/route');
}

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/backgrounds');
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url);
}

/** The serve URLs of a typed list (the listing always answers MediaListItem[]). */
async function urlsOf(res: Response): Promise<string[]> {
  return ((await res.json()) as Array<{ url: string }>).map((item) => item.url);
}

/** Build a FormData-bearing POST request */
function makePostRequest(
  files: Array<{ name: string; type: string; content: Buffer }>,
  directory?: string,
): NextRequest {
  const formData = new FormData();
  if (directory) {
    formData.set('directory', directory);
  }
  for (const f of files) {
    const blob = new Blob([new Uint8Array(f.content)], { type: f.type });
    formData.append('file', new File([blob], f.name, { type: f.type }));
  }
  return new NextRequest('http://localhost/api/backgrounds', {
    method: 'POST',
    body: formData,
  });
}

function makeDeleteRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/backgrounds', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

// ─── safePath: directory traversal prevention ───────────────────

describe('safePath — directory traversal prevention', () => {
  it('rejects ../ in directory parameter (GET)', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ directory: '../../etc' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid directory');
  });

  it('rejects ../ in directory parameter (POST)', async () => {
    const { POST } = await getHandlers();
    const res = await POST(
      makePostRequest(
        [{ name: 'test.jpg', type: 'image/jpeg', content: Buffer.from('x') }],
        '../../etc',
      ),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid directory');
  });

  it('rejects decoded URL-encoded traversal (GET)', async () => {
    const { GET } = await getHandlers();
    // Simulate what a real HTTP request would deliver: the URL parser decodes
    // %2f to /, so the handler sees the literal string "../../etc"
    const url = new URL('http://localhost/api/backgrounds');
    url.searchParams.set('directory', '../../etc');
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid directory');
  });

  it('treats literal %2f as a safe directory name (no real traversal)', async () => {
    const { GET } = await getHandlers();
    // When searchParams.set receives "..%2f..%2fetc", the %2f is a literal
    // character sequence (not a slash). This is NOT a traversal attack —
    // path.resolve treats it as a harmless subdirectory name.
    const res = await GET(makeGetRequest({ directory: '..%2f..%2fetc' }));
    // This is actually a valid (nonexistent) subdirectory name, returns empty
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('reads an absolute-looking directory as a library folder, never outside the library', async () => {
    const { GET } = await getHandlers();
    // A leading slash is dropped, so "/etc/passwd" names the library folder
    // "etc/passwd", which does not exist: nothing outside the library is read.
    const res = await GET(makeGetRequest({ directory: '/etc/passwd' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('rejects nested traversal: subdir/../../.. (GET)', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ directory: 'subdir/../../../etc' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid directory');
  });

  it('rejects traversal in DELETE directory parameter', async () => {
    const { DELETE } = await getHandlers();
    const res = await DELETE(
      makeDeleteRequest({ file: 'test.jpg', directory: '../../etc' }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid path');
  });

  it('allows valid subdirectory (GET)', async () => {
    const { GET } = await getHandlers();
    const subDir = path.join(bgsDir, 'wallpapers');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, 'nature.jpg'), 'img');

    const res = await GET(makeGetRequest({ directory: 'wallpapers' }));
    expect(res.status).toBe(200);
    const json = await urlsOf(res);
    expect(json).toHaveLength(1);
    expect(json[0]).toContain('nature.jpg');
  });

  it('allows nested valid subdirectory', async () => {
    const { GET } = await getHandlers();
    const subDir = path.join(bgsDir, 'category', 'nature');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, 'forest.png'), 'img');

    const res = await GET(makeGetRequest({ directory: 'category/nature' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
  });

  it('rejects single .. traversal (GET)', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ directory: '..' }));
    expect(res.status).toBe(400);
  });

  it('rejects double-dot at end of path segment', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ directory: 'foo/../..' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid directory');
  });
});

// ─── GET endpoint ───────────────────────────────────────────────

describe('GET /api/backgrounds', () => {
  it('lists only image files, filtering out non-image extensions', async () => {
    const { GET } = await getHandlers();

    await fs.writeFile(path.join(bgsDir, 'photo.jpg'), 'img');
    await fs.writeFile(path.join(bgsDir, 'landscape.png'), 'img');
    await fs.writeFile(path.join(bgsDir, 'banner.webp'), 'img');
    await fs.writeFile(path.join(bgsDir, 'icon.gif'), 'img');
    await fs.writeFile(path.join(bgsDir, 'modern.avif'), 'img');
    await fs.writeFile(path.join(bgsDir, 'readme.txt'), 'text');
    await fs.writeFile(path.join(bgsDir, 'config.json'), '{}');
    await fs.writeFile(path.join(bgsDir, 'script.js'), 'code');
    await fs.writeFile(path.join(bgsDir, '.DS_Store'), 'mac');

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await urlsOf(res);

    expect(json).toHaveLength(5);

    for (const url of json) {
      expect(url).toMatch(/^\/api\/backgrounds\/serve\?file=/);
    }

    const decoded = json.map((u) => decodeURIComponent(u));
    expect(decoded.some((u) => u.includes('photo.jpg'))).toBe(true);
    expect(decoded.some((u) => u.includes('landscape.png'))).toBe(true);
    expect(decoded.some((u) => u.includes('banner.webp'))).toBe(true);
    expect(decoded.some((u) => u.includes('icon.gif'))).toBe(true);
    expect(decoded.some((u) => u.includes('modern.avif'))).toBe(true);
    expect(decoded.some((u) => u.includes('readme.txt'))).toBe(false);
    expect(decoded.some((u) => u.includes('config.json'))).toBe(false);
    expect(decoded.some((u) => u.includes('.DS_Store'))).toBe(false);
  });

  it('returns correct serve URLs with encoded filenames', async () => {
    const { GET } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'my photo (1).jpg'), 'img');

    const res = await GET(makeGetRequest());
    const json = await urlsOf(res);

    expect(json).toHaveLength(1);
    expect(json[0]).toBe(
      `/api/backgrounds/serve?file=${encodeURIComponent('my photo (1).jpg')}`,
    );
  });

  it('handles directory parameter and includes it in serve URL', async () => {
    const { GET } = await getHandlers();
    const subDir = path.join(bgsDir, 'seasonal');
    await fs.mkdir(subDir);
    await fs.writeFile(path.join(subDir, 'winter.jpg'), 'img');

    const res = await GET(makeGetRequest({ directory: 'seasonal' }));
    expect(res.status).toBe(200);
    const json = await urlsOf(res);

    expect(json).toHaveLength(1);
    expect(json[0]).toBe(
      `/api/backgrounds/serve?file=${encodeURIComponent('seasonal/winter.jpg')}`,
    );
  });

  it('returns empty array for nonexistent subdirectory', async () => {
    const { GET } = await getHandlers();

    const res = await GET(makeGetRequest({ directory: 'doesnotexist' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('auto-creates root backgrounds directory if it does not exist', async () => {
    const { GET } = await getHandlers();
    await fs.rm(bgsDir, { recursive: true, force: true });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);

    const stat = await fs.stat(bgsDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('does NOT auto-create subdirectories', async () => {
    const { GET } = await getHandlers();

    const res = await GET(makeGetRequest({ directory: 'newsubdir' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);

    await expect(fs.access(path.join(bgsDir, 'newsubdir'))).rejects.toThrow();
  });

  it('handles .jpeg extension (not just .jpg)', async () => {
    const { GET } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'photo.jpeg'), 'img');

    const res = await GET(makeGetRequest());
    const json = await urlsOf(res);
    expect(json).toHaveLength(1);
  });

  it('matches image extensions case-insensitively', async () => {
    const { GET } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'PHOTO.JPG'), 'img');
    await fs.writeFile(path.join(bgsDir, 'art.PNG'), 'img');

    const res = await GET(makeGetRequest());
    const json = await urlsOf(res);
    expect(json).toHaveLength(2);
  });

  it('does not list subdirectories as files', async () => {
    const { GET } = await getHandlers();
    await fs.mkdir(path.join(bgsDir, 'subdir.jpg'));
    await fs.writeFile(path.join(bgsDir, 'real.jpg'), 'img');

    const res = await GET(makeGetRequest());
    const json = await urlsOf(res);
    expect(json).toHaveLength(1);
    expect(json[0]).toContain('real.jpg');
  });

  it('leaves the background rotation\'s top-level downloads out of every list', async () => {
    const { GET } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'rotation-unsplash-abc123.jpg'), 'img');
    await fs.writeFile(path.join(bgsDir, 'beach.jpg'), 'img');
    // Inside a folder the name is only a name: the person's own picture.
    await fs.mkdir(path.join(bgsDir, 'Trips'));
    await fs.writeFile(path.join(bgsDir, 'Trips', 'rotation-day.jpg'), 'img');

    const plain = await urlsOf(await GET(makeGetRequest()));
    expect(plain).toEqual([`/api/backgrounds/serve?file=${encodeURIComponent('beach.jpg')}`]);
    const typed: { url: string }[] = await (await GET(makeGetRequest({ media: 'both' }))).json();
    expect(typed.map((item) => item.url)).toEqual([`/api/backgrounds/serve?file=${encodeURIComponent('beach.jpg')}`]);
    const trips = await urlsOf(await GET(makeGetRequest({ directory: 'Trips' })));
    expect(trips).toEqual([`/api/backgrounds/serve?file=${encodeURIComponent('Trips/rotation-day.jpg')}`]);
  });
});

// ─── GET endpoint: media= typed lists ───────────────────────────

describe('GET /api/backgrounds library revision', () => {
  it('says which library revision a folder list reflects, and a new one after an upload', async () => {
    const { GET, POST } = await getHandlers();
    await fs.mkdir(path.join(bgsDir, 'trip'));

    const before = (await GET(makeGetRequest({ directory: 'trip' }))).headers.get('X-Library-Revision');
    expect(before).toMatch(/^[a-z0-9]+\.\d+$/);
    // The same library, the same revision.
    expect((await GET(makeGetRequest({ directory: 'trip', media: 'both' }))).headers.get('X-Library-Revision')).toBe(before);

    const upload = await POST(makePostRequest([{ name: 'a.png', type: 'image/png', content: Buffer.from('png') }], 'trip'));
    expect(upload.status).toBe(201);
    expect((await GET(makeGetRequest({ directory: 'trip' }))).headers.get('X-Library-Revision')).not.toBe(before);
  });

  it('names no revision on a single-file lookup', async () => {
    const { GET } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'one.jpg'), 'img');
    const res = await GET(makeGetRequest({ file: 'one.jpg' }));
    expect(res.headers.get('X-Library-Revision')).toBeNull();
  });
});

describe('GET /api/backgrounds with media parameter', () => {
  beforeEach(async () => {
    await fs.writeFile(path.join(bgsDir, 'photo.jpg'), 'img');
    await fs.writeFile(path.join(bgsDir, 'clip.mp4'), 'vid');
    await fs.writeFile(path.join(bgsDir, 'movie.webm'), 'vid');
    await fs.writeFile(path.join(bgsDir, 'iphone.mov'), 'vid');
    await fs.writeFile(path.join(bgsDir, 'readme.txt'), 'text');
  });

  it('without media= answers typed image entries, as media=photos does', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].type).toBe('image');
    expect(json[0].url).toContain('photo.jpg');
  });

  it('media=photos returns typed image entries only', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'photos' }));
    const json = await res.json();
    expect(json).toEqual([
      { url: `/api/backgrounds/serve?file=${encodeURIComponent('photo.jpg')}`, type: 'image' },
    ]);
  });

  it('media=videos returns typed video entries only', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'videos' }));
    const json = await res.json();
    expect(json).toHaveLength(3);
    for (const item of json) {
      expect(item.type).toBe('video');
      expect(item.url).toMatch(/^\/api\/backgrounds\/serve\?file=/);
    }
  });

  it('media=both returns images and videos together', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'both' }));
    const json = await res.json();
    expect(json).toHaveLength(4);
    expect(json.filter((i: { type: string }) => i.type === 'image')).toHaveLength(1);
    expect(json.filter((i: { type: string }) => i.type === 'video')).toHaveLength(3);
  });

  it('omits mt tokens when auth is disabled', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'videos' }));
    const json = await res.json();
    for (const item of json) {
      expect(item.url).not.toContain('mt=');
    }
  });

  it('appends mt tokens to video URLs when auth is enabled', async () => {
    authState.mediaSecret = 's'.repeat(64);
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'videos' }));
    const json = await res.json();
    for (const item of json) {
      expect(item.url).toContain('&mt=');
    }
  });

  it('does not append mt tokens to image entries even with auth enabled', async () => {
    authState.mediaSecret = 's'.repeat(64);
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'both' }));
    const json = await res.json();
    const image = json.find((i: { type: string }) => i.type === 'image');
    expect(image.url).not.toContain('mt=');
  });

  it('includes the directory in video file paths', async () => {
    const { GET } = await getHandlers();
    const subDir = path.join(bgsDir, 'clips');
    await fs.mkdir(subDir);
    await fs.writeFile(path.join(subDir, 'family.mp4'), 'vid');
    const res = await GET(makeGetRequest({ media: 'videos', directory: 'clips' }));
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].url).toContain(encodeURIComponent('clips/family.mp4'));
  });

  it('rejects an unknown media value', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'audio' }));
    expect(res.status).toBe(400);
  });
});

// ─── GET endpoint: file= point lookup ───────────────────────────

describe('GET /api/backgrounds with file parameter', () => {
  beforeEach(async () => {
    await fs.writeFile(path.join(bgsDir, 'photo.jpg'), 'img');
    await fs.writeFile(path.join(bgsDir, 'clip.mp4'), 'vid');
    const subDir = path.join(bgsDir, 'clips');
    await fs.mkdir(subDir);
    await fs.writeFile(path.join(subDir, 'family.mp4'), 'vid');
  });

  it('returns a single typed video entry for a root file', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'videos', file: 'clip.mp4' }));
    const json = await res.json();
    expect(json).toEqual([
      { url: `/api/backgrounds/serve?file=${encodeURIComponent('clip.mp4')}`, type: 'video' },
    ]);
  });

  it('resolves a nested file without touching its siblings', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'videos', file: 'clips/family.mp4' }));
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].url).toContain(encodeURIComponent('clips/family.mp4'));
  });

  it('binds an mt token to the file path when auth is enabled', async () => {
    authState.mediaSecret = 's'.repeat(64);
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'videos', file: 'clips/family.mp4' }));
    const json = await res.json();
    expect(json[0].url).toContain('&mt=');
  });

  it('returns [] for a missing file', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'videos', file: 'gone.mp4' }));
    expect(await res.json()).toEqual([]);
  });

  it('returns [] when the file does not match the media filter', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ media: 'videos', file: 'photo.jpg' }));
    expect(await res.json()).toEqual([]);
  });

  it('returns a typed image entry without a media filter', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ file: 'photo.jpg' }));
    const json = await res.json();
    expect(json).toEqual([
      { url: `/api/backgrounds/serve?file=${encodeURIComponent('photo.jpg')}`, type: 'image' },
    ]);
  });

  it('rejects traversal in the file parameter', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ file: '../../etc/passwd' }));
    expect(res.status).toBe(400);
  });
});

// ─── POST endpoint ──────────────────────────────────────────────

describe('POST /api/backgrounds', () => {
  it('rejects files over 10MB (status 413)', async () => {
    const { POST } = await getHandlers();
    const bigContent = Buffer.alloc(10 * 1024 * 1024 + 1);

    const res = await POST(
      makePostRequest([
        { name: 'huge.jpg', type: 'image/jpeg', content: bigContent },
      ]),
    );
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toContain('File too large');
    expect(json.error).toContain('huge.jpg');
  });

  it('rejects non-image MIME types (status 400)', async () => {
    const { POST } = await getHandlers();

    const res = await POST(
      makePostRequest([
        {
          name: 'malware.exe',
          type: 'application/octet-stream',
          content: Buffer.from('bad'),
        },
      ]),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid file type');
  });

  it('rejects text/html MIME type', async () => {
    const { POST } = await getHandlers();

    const res = await POST(
      makePostRequest([
        { name: 'page.html', type: 'text/html', content: Buffer.from('<html>') },
      ]),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid file type');
  });

  it('sanitizes uploaded filenames', async () => {
    const { POST } = await getHandlers();

    const res = await POST(
      makePostRequest([
        {
          name: 'my photo (1) [final].jpg',
          type: 'image/jpeg',
          content: Buffer.from('img'),
        },
      ]),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.path).toContain('my_photo__1___final_.jpg');

    const files = await fs.readdir(bgsDir);
    expect(files).toContain('my_photo__1___final_.jpg');
  });

  it('returns 201 with path for a single file', async () => {
    const { POST } = await getHandlers();

    const res = await POST(
      makePostRequest([
        { name: 'sunset.png', type: 'image/png', content: Buffer.from('png-data') },
      ]),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.path).toBeDefined();
    expect(json.path).toContain('sunset.png');
    expect(json.paths).toBeUndefined();
  });

  it('returns 201 with paths array for multiple files', async () => {
    const { POST } = await getHandlers();

    const res = await POST(
      makePostRequest([
        { name: 'one.jpg', type: 'image/jpeg', content: Buffer.from('a') },
        { name: 'two.png', type: 'image/png', content: Buffer.from('b') },
      ]),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.paths).toHaveLength(2);
    expect(json.path).toBeUndefined();
    expect(json.paths[0]).toContain('one.jpg');
    expect(json.paths[1]).toContain('two.png');
  });

  it('returns 400 when no files provided', async () => {
    const { POST } = await getHandlers();
    const formData = new FormData();
    const req = new NextRequest('http://localhost/api/backgrounds', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('No file provided');
  });

  it('actually writes file contents to disk', async () => {
    const { POST } = await getHandlers();
    const content = Buffer.from('real-jpeg-binary-data');

    await POST(
      makePostRequest([
        { name: 'written.jpg', type: 'image/jpeg', content },
      ]),
    );

    const onDisk = await fs.readFile(path.join(bgsDir, 'written.jpg'));
    expect(onDisk).toEqual(content);
  });

  it('creates directory if it does not exist', async () => {
    const { POST } = await getHandlers();
    await fs.rm(bgsDir, { recursive: true });

    const res = await POST(
      makePostRequest([
        { name: 'test.jpg', type: 'image/jpeg', content: Buffer.from('x') },
      ]),
    );
    expect(res.status).toBe(201);

    const stat = await fs.stat(bgsDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('accepts all allowed MIME types', async () => {
    const { POST } = await getHandlers();
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
    ];

    for (const type of allowedTypes) {
      const ext = type.split('/')[1];
      const res = await POST(
        makePostRequest([
          { name: `test-${ext}.${ext}`, type, content: Buffer.from('img') },
        ]),
      );
      expect(res.status).toBe(201);
    }
  });

  it('accepts video MIME types (mp4, webm, quicktime)', async () => {
    const { POST } = await getHandlers();
    const videos = [
      { name: 'clip.mp4', type: 'video/mp4' },
      { name: 'clip.webm', type: 'video/webm' },
      { name: 'clip.mov', type: 'video/quicktime' },
    ];
    for (const v of videos) {
      const res = await POST(
        makePostRequest([{ name: v.name, type: v.type, content: Buffer.from('vid') }]),
      );
      expect(res.status).toBe(201);
    }
  });

  it('allows videos past the 10 MB image cap', async () => {
    const { POST } = await getHandlers();
    const res = await POST(
      makePostRequest([
        { name: 'big.mp4', type: 'video/mp4', content: Buffer.alloc(11 * 1024 * 1024) },
      ]),
    );
    expect(res.status).toBe(201);
  });

  it('uploads to a subdirectory when directory parameter is given', async () => {
    const { POST } = await getHandlers();

    const res = await POST(
      makePostRequest(
        [{ name: 'sub.jpg', type: 'image/jpeg', content: Buffer.from('img') }],
        'seasonal',
      ),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.path).toContain('seasonal');

    const files = await fs.readdir(path.join(bgsDir, 'seasonal'));
    expect(files).toContain('sub.jpg');
  });

  it('validates ALL files before writing any (no partial writes on error)', async () => {
    const { POST } = await getHandlers();

    const res = await POST(
      makePostRequest([
        { name: 'good.jpg', type: 'image/jpeg', content: Buffer.from('ok') },
        {
          name: 'toobig.jpg',
          type: 'image/jpeg',
          content: Buffer.alloc(10 * 1024 * 1024 + 1),
        },
      ]),
    );
    expect(res.status).toBe(413);

    const files = await fs.readdir(bgsDir);
    expect(files).not.toContain('good.jpg');
  });
});

// ─── DELETE endpoint ────────────────────────────────────────────

describe('POST /api/backgrounds reserved names', () => {
  it('refuses a top-level upload named like a rotation file, but allows it in a folder', async () => {
    const { POST } = await getHandlers();
    const rejected = await POST(makePostRequest([{ name: 'rotation-mine.png', type: 'image/png', content: Buffer.from('img') }]));
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toContain('rotation-');
    await expect(fs.access(path.join(bgsDir, 'rotation-mine.png'))).rejects.toThrow();

    const allowed = await POST(makePostRequest([{ name: 'rotation-mine.png', type: 'image/png', content: Buffer.from('img') }], 'trips'));
    expect(allowed.status).toBe(201);
  });
});

describe('POST /api/backgrounds same name', () => {
  it('keeps the file already there and stores the new one under the next free name', async () => {
    const { POST } = await getHandlers();
    const first = await POST(makePostRequest([{ name: 'red.jpg', type: 'image/jpeg', content: Buffer.from('one') }], 'family'));
    expect(first.status).toBe(201);
    const second = await POST(makePostRequest([{ name: 'red.jpg', type: 'image/jpeg', content: Buffer.from('two') }], 'family'));
    expect(second.status).toBe(201);
    expect((await second.json()).path).toBe('/api/backgrounds/serve?file=family%2Fred-2.jpg');
    const third = await POST(makePostRequest([{ name: 'red.jpg', type: 'image/jpeg', content: Buffer.from('three') }], 'family'));
    expect((await third.json()).path).toContain('red-3.jpg');

    const folder = path.join(bgsDir, 'family');
    expect(await fs.readFile(path.join(folder, 'red.jpg'), 'utf8')).toBe('one');
    expect(await fs.readFile(path.join(folder, 'red-2.jpg'), 'utf8')).toBe('two');
  });

  it('keeps two same-named files in one batch apart', async () => {
    const { POST } = await getHandlers();
    const res = await POST(makePostRequest([
      { name: 'a.png', type: 'image/png', content: Buffer.from('1') },
      { name: 'a.png', type: 'image/png', content: Buffer.from('2') },
    ], 'batch'));
    expect(res.status).toBe(201);
    expect((await fs.readdir(path.join(bgsDir, 'batch'))).sort()).toEqual(['a-2.png', 'a.png']);
  });
});

describe('POST /api/backgrounds replace', () => {
  function makeReplaceRequest(target: string, file: { name: string; type: string; content: Buffer }): NextRequest {
    const formData = new FormData();
    formData.set('replace', target);
    formData.append('file', new File([new Blob([new Uint8Array(file.content)], { type: file.type })], file.name, { type: file.type }));
    return new NextRequest('http://localhost/api/backgrounds', { method: 'POST', body: formData });
  }

  it('overwrites the file in place under its old name', async () => {
    const { POST } = await getHandlers();
    const natureDir = path.join(bgsDir, 'nature');
    await fs.mkdir(natureDir, { recursive: true });
    await fs.writeFile(path.join(natureDir, 'a.jpg'), 'old');

    const res = await POST(makeReplaceRequest('nature/a.jpg', { name: 'whatever name.JPG', type: 'image/jpeg', content: Buffer.from('new bytes') }));
    expect(res.status).toBe(200);
    expect((await res.json()).path).toBe('/api/backgrounds/serve?file=nature%2Fa.jpg');
    expect(await fs.readFile(path.join(natureDir, 'a.jpg'), 'utf8')).toBe('new bytes');
    // No stray upload under the picked file's name, no temp file left behind.
    expect(await fs.readdir(natureDir)).toEqual(['a.jpg']);
  });

  it('refuses a replacement with a different extension, and a missing target', async () => {
    const { POST } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'a.jpg'), 'old');

    const wrongExt = await POST(makeReplaceRequest('a.jpg', { name: 'b.png', type: 'image/png', content: Buffer.from('new') }));
    expect(wrongExt.status).toBe(400);
    expect((await wrongExt.json()).error).toContain('.jpg');
    expect(await fs.readFile(path.join(bgsDir, 'a.jpg'), 'utf8')).toBe('old');

    const missing = await POST(makeReplaceRequest('nope.jpg', { name: 'b.jpg', type: 'image/jpeg', content: Buffer.from('new') }));
    expect(missing.status).toBe(404);
  });

  it('applies the upload type and size rules and rejects traversal in the target', async () => {
    const { POST } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'a.jpg'), 'old');
    const badType = await POST(makeReplaceRequest('a.jpg', { name: 'b.jpg', type: 'text/html', content: Buffer.from('<x>') }));
    expect(badType.status).toBe(400);
    const traversal = await POST(makeReplaceRequest('../a.jpg', { name: 'b.jpg', type: 'image/jpeg', content: Buffer.from('new') }));
    expect([400, 404]).toContain(traversal.status);
    expect(await fs.readFile(path.join(bgsDir, 'a.jpg'), 'utf8')).toBe('old');
  });
});

describe('DELETE /api/backgrounds', () => {
  it('deletes an existing file', async () => {
    const { DELETE } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'remove-me.jpg'), 'img');

    const res = await DELETE(makeDeleteRequest({ file: 'remove-me.jpg' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe('remove-me.jpg');

    await expect(fs.access(path.join(bgsDir, 'remove-me.jpg'))).rejects.toThrow();
  });

  it('returns 404 for nonexistent file', async () => {
    const { DELETE } = await getHandlers();

    const res = await DELETE(makeDeleteRequest({ file: 'ghost.jpg' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('File not found');
  });

  it('returns 400 when file parameter is missing', async () => {
    const { DELETE } = await getHandlers();

    const res = await DELETE(makeDeleteRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('file parameter required');
  });

  it('returns 400 when file parameter is not a string', async () => {
    const { DELETE } = await getHandlers();

    const res = await DELETE(makeDeleteRequest({ file: 123 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('file parameter required');
  });

  it('strips directory traversal from file param via basename', async () => {
    const { DELETE } = await getHandlers();
    // Plant a file called 'passwd' in bgsDir
    await fs.writeFile(path.join(bgsDir, 'passwd'), 'not-real');

    const res = await DELETE(
      makeDeleteRequest({ file: '../../../etc/passwd' }),
    );
    // path.basename strips traversal, resolves to bgsDir/passwd
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe('passwd');

    // Only bgsDir/passwd was deleted
    await expect(fs.access(path.join(bgsDir, 'passwd'))).rejects.toThrow();
  });

  it('prevents traversal via directory parameter in DELETE', async () => {
    const { DELETE } = await getHandlers();

    const res = await DELETE(
      makeDeleteRequest({ file: 'test.jpg', directory: '../../../etc' }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid path');
  });

  it('deletes file from a subdirectory', async () => {
    const { DELETE } = await getHandlers();
    const subDir = path.join(bgsDir, 'wallpapers');
    await fs.mkdir(subDir);
    await fs.writeFile(path.join(subDir, 'old.jpg'), 'img');

    const res = await DELETE(
      makeDeleteRequest({ file: 'old.jpg', directory: 'wallpapers' }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe('old.jpg');
    await expect(fs.access(path.join(subDir, 'old.jpg'))).rejects.toThrow();
  });

  it('returns 404 when file does not exist in specified directory', async () => {
    const { DELETE } = await getHandlers();
    const subDir = path.join(bgsDir, 'empty');
    await fs.mkdir(subDir);

    const res = await DELETE(
      makeDeleteRequest({ file: 'nope.jpg', directory: 'empty' }),
    );
    expect(res.status).toBe(404);
  });
});

// ─── DELETE endpoint: files the config still uses ───────────────

describe('DELETE /api/backgrounds in-use protection', () => {
  /** Seed nature/a.png and hand back its absolute path. */
  async function seedNaturePng() {
    const natureDir = path.join(bgsDir, 'nature');
    await fs.mkdir(natureDir, { recursive: true });
    const abs = path.join(natureDir, 'a.png');
    await fs.writeFile(abs, 'img');
    return abs;
  }

  it('refuses a file the config references via a serve URL', async () => {
    configState.config = {
      screens: [
        {
          id: 's1',
          name: 'Home',
          backgroundImage: '/api/backgrounds/serve?file=nature%2Fa.png',
        },
      ],
    };
    const { DELETE } = await getHandlers();
    const abs = await seedNaturePng();

    const res = await DELETE(makeDeleteRequest({ file: 'a.png', directory: 'nature' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('in use');
    expect(Array.isArray(json.usage)).toBe(true);
    expect(json.usage.length).toBeGreaterThan(0);
    expect(json.usage[0].kind).toBe('screen');

    // The file survives the refusal.
    await expect(fs.access(abs)).resolves.toBeUndefined();
  });

  it('refuses a file the config references via a bare path', async () => {
    configState.config = {
      screens: [{ id: 's1', name: 'Home', backgroundImage: 'nature/a.png' }],
    };
    const { DELETE } = await getHandlers();
    const abs = await seedNaturePng();

    const res = await DELETE(makeDeleteRequest({ file: 'a.png', directory: 'nature' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('in use');
    expect(json.usage.length).toBe(1);

    await expect(fs.access(abs)).resolves.toBeUndefined();
  });

  it('reports every reference: two uses yield two usage entries', async () => {
    configState.config = {
      screens: [
        { id: 's1', name: 'Home', backgroundImage: 'nature/a.png' },
        {
          id: 's2',
          name: 'Away',
          backgroundImage: '/api/backgrounds/serve?file=nature%2Fa.png',
        },
      ],
    };
    const { DELETE } = await getHandlers();
    await seedNaturePng();

    const res = await DELETE(makeDeleteRequest({ file: 'a.png', directory: 'nature' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.usage).toHaveLength(2);
    expect(new Set(json.usage.map((u: { configPath: string }) => u.configPath)).size).toBe(2);
  });

  it('deletes an unreferenced file even when the config references others', async () => {
    configState.config = {
      screens: [{ id: 's1', name: 'Home', backgroundImage: 'nature/a.png' }],
    };
    const { DELETE } = await getHandlers();
    await seedNaturePng();
    await fs.writeFile(path.join(bgsDir, 'unused.jpg'), 'img');

    const res = await DELETE(makeDeleteRequest({ file: 'unused.jpg' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe('unused.jpg');
    await expect(fs.access(path.join(bgsDir, 'unused.jpg'))).rejects.toThrow();
  });

  it('refuses a hand-placed spaced filename referenced as a bare path, naming the screen', async () => {
    configState.config = {
      screens: [{ id: 's1', name: 'Home', backgroundImage: 'my photo.jpg' }],
    };
    const { DELETE } = await getHandlers();
    const abs = path.join(bgsDir, 'my photo.jpg');
    await fs.writeFile(abs, 'img');

    const res = await DELETE(makeDeleteRequest({ file: 'my photo.jpg' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('in use');
    // One scanner drives both the badge and the refusal, so the refusal
    // carries the same where-used detail the page shows.
    expect(json.usage).toEqual([
      { kind: 'screen', name: 'Home', configPath: 'screens[0].backgroundImage', screenId: 's1' },
    ]);

    await expect(fs.access(abs)).resolves.toBeUndefined();
  });

  it('refuses a spaced filename in a hand-edited, unencoded serve URL', async () => {
    configState.config = {
      screens: [
        { id: 's1', name: 'Home', backgroundImage: '/api/backgrounds/serve?file=my photo.jpg' },
      ],
    };
    const { DELETE } = await getHandlers();
    const abs = path.join(bgsDir, 'my photo.jpg');
    await fs.writeFile(abs, 'img');

    const res = await DELETE(makeDeleteRequest({ file: 'my photo.jpg' }));
    expect(res.status).toBe(409);
    expect((await res.json()).usage).toHaveLength(1);
    await expect(fs.access(abs)).resolves.toBeUndefined();
  });

  it('refuses a hand-placed spaced filename referenced via an encoded serve URL', async () => {
    configState.config = {
      screens: [
        {
          id: 's1',
          name: 'Home',
          backgroundImage: '/api/backgrounds/serve?file=my%20photo.jpg',
        },
      ],
    };
    const { DELETE } = await getHandlers();
    const abs = path.join(bgsDir, 'my photo.jpg');
    await fs.writeFile(abs, 'img');

    const res = await DELETE(makeDeleteRequest({ file: 'my photo.jpg' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('in use');
    expect(json.usage).toHaveLength(1);

    await expect(fs.access(abs)).resolves.toBeUndefined();
  });

  it('refuses a file an older install references as /backgrounds/<path>', async () => {
    configState.config = {
      screens: [{ id: 's1', name: 'Home', backgroundImage: '/backgrounds/nature/a.png' }],
    };
    const { DELETE } = await getHandlers();
    const abs = await seedNaturePng();

    const res = await DELETE(makeDeleteRequest({ file: 'a.png', directory: 'nature' }));
    expect(res.status).toBe(409);
    await expect(fs.access(abs)).resolves.toBeUndefined();
  });

  it('keys the in-use check on the normalized path, whatever the directory spelling', async () => {
    configState.config = {
      screens: [{ id: 's1', name: 'Home', backgroundImage: 'nature/a.png' }],
    };
    const { DELETE } = await getHandlers();
    const abs = await seedNaturePng();

    for (const directory of ['nature/', './nature', 'nature//', '/nature']) {
      const res = await DELETE(makeDeleteRequest({ file: 'a.png', directory }));
      expect(res.status, directory).toBe(409);
    }
    // Dot-dot segments are not a spelling of anything: refused outright.
    const res = await DELETE(makeDeleteRequest({ file: 'a.png', directory: 'nature/../nature' }));
    expect(res.status).toBe(400);
    await expect(fs.access(abs)).resolves.toBeUndefined();
  });

  it('ignores an unrelated URL that happens to carry a file= param', async () => {
    configState.config = {
      screens: [{ id: 's1', name: 'Home', modules: [
        { type: 'iframe', config: { url: 'https://photos.example.com/view?file=beach.jpg' } },
      ] }],
    };
    const { DELETE } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'beach.jpg'), 'img');

    const res = await DELETE(makeDeleteRequest({ file: 'beach.jpg' }));
    expect(res.status).toBe(200);
    await expect(fs.access(path.join(bgsDir, 'beach.jpg'))).rejects.toThrow();
  });

  it('lets a slideshow picture go while the slideshow has another to show', async () => {
    configState.config = {
      screens: [{ id: 's1', name: 'Hall', modules: [
        { type: 'photo-slideshow', config: { photoSource: { kind: 'library', folder: 'nature' } } },
      ] }],
    };
    const { DELETE } = await getHandlers();
    const abs = await seedNaturePng();
    await fs.writeFile(path.join(bgsDir, 'nature', 'b.png'), 'img');

    const first = await DELETE(makeDeleteRequest({ file: 'a.png', directory: 'nature' }));
    expect(first.status).toBe(200);
    await expect(fs.access(abs)).rejects.toThrow();

    // b.png is now all the slideshow has: it stays.
    const last = await DELETE(makeDeleteRequest({ file: 'b.png', directory: 'nature' }));
    expect(last.status).toBe(409);
    expect((await last.json()).usage).toEqual([
      { kind: 'slideshow', name: 'Hall', configPath: 'screens[0].modules[0].config.photoSource.folder', screenId: 's1' },
    ]);
    await expect(fs.access(path.join(bgsDir, 'nature', 'b.png'))).resolves.toBeUndefined();
  });

  it("keeps a photos-only slideshow's last photo even with videos left beside it", async () => {
    configState.config = {
      screens: [{ id: 's1', name: 'Hall', modules: [
        { type: 'photo-slideshow', config: { photoSource: { kind: 'library', folder: 'nature' } } },
      ] }],
    };
    const { DELETE } = await getHandlers();
    await seedNaturePng();
    await fs.writeFile(path.join(bgsDir, 'nature', 'clip.mp4'), 'vid');

    const photo = await DELETE(makeDeleteRequest({ file: 'a.png', directory: 'nature' }));
    expect(photo.status).toBe(409);
    // The video is nothing this slideshow plays, so it goes.
    const video = await DELETE(makeDeleteRequest({ file: 'clip.mp4', directory: 'nature' }));
    expect(video.status).toBe(200);
  });

  it("does not count the background rotation's downloads as a top-level slideshow's other pictures", async () => {
    configState.config = {
      screens: [{ id: 's1', name: 'Hall', modules: [{ type: 'fullscreen-photo', config: { photoSource: { kind: 'library', folder: '' } } }] }],
    };
    const { DELETE } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'only.jpg'), 'img');
    await fs.writeFile(path.join(bgsDir, 'rotation-unsplash-x.jpg'), 'img');

    const res = await DELETE(makeDeleteRequest({ file: 'only.jpg' }));
    expect(res.status).toBe(409);
  });

  it('refuses every file inside a folder a slideshow shows', async () => {
    configState.config = {
      screens: [{ id: 's1', name: 'Hall', modules: [
        { type: 'photo-slideshow', config: { photoSource: { kind: 'library', folder: 'nature' } } },
      ] }],
    };
    const { DELETE } = await getHandlers();
    const abs = await seedNaturePng();

    const res = await DELETE(makeDeleteRequest({ file: 'a.png', directory: 'nature' }));
    expect(res.status).toBe(409);
    expect((await res.json()).usage).toEqual([
      { kind: 'slideshow', name: 'Hall', configPath: 'screens[0].modules[0].config.photoSource.folder', screenId: 's1' },
    ]);
    await expect(fs.access(abs)).resolves.toBeUndefined();
  });

  it('refuses a rotation file a screen is showing right now and deletes a stale one', async () => {
    vi.doMock('@/lib/background-rotation-cache', async () => {
      const actual = await vi.importActual<typeof import('@/lib/background-rotation-cache')>(
        '@/lib/background-rotation-cache',
      );
      return {
        ...actual,
        rotationCacheStore: {
          read: async () => ({
            s1: { path: '/api/backgrounds/serve?file=rotation-unsplash-live.jpg', source: 'unsplash', query: '', fetchedAt: 0, intervalMinutes: 60 },
          }),
        },
      };
    });
    const { DELETE } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'rotation-unsplash-live.jpg'), 'img');
    await fs.writeFile(path.join(bgsDir, 'rotation-unsplash-stale.jpg'), 'img');

    const live = await DELETE(makeDeleteRequest({ file: 'rotation-unsplash-live.jpg' }));
    expect(live.status).toBe(409);
    expect((await live.json()).usage).toEqual([{ kind: 'rotation', configPath: 'rotation' }]);
    await expect(fs.access(path.join(bgsDir, 'rotation-unsplash-live.jpg'))).resolves.toBeUndefined();

    const stale = await DELETE(makeDeleteRequest({ file: 'rotation-unsplash-stale.jpg' }));
    expect(stale.status).toBe(200);
    await expect(fs.access(path.join(bgsDir, 'rotation-unsplash-stale.jpg'))).rejects.toThrow();
    vi.doUnmock('@/lib/background-rotation-cache');
  });

  it('does not mistake a substring: root a.jpg deletes while nature/a.jpg is used', async () => {
    configState.config = {
      screens: [{ id: 's1', name: 'Home', backgroundImage: 'nature/a.jpg' }],
    };
    const { DELETE } = await getHandlers();
    const natureDir = path.join(bgsDir, 'nature');
    await fs.mkdir(natureDir);
    await fs.writeFile(path.join(natureDir, 'a.jpg'), 'img');
    await fs.writeFile(path.join(bgsDir, 'a.jpg'), 'img');

    const res = await DELETE(makeDeleteRequest({ file: 'a.jpg' }));
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe('a.jpg');
    await expect(fs.access(path.join(bgsDir, 'a.jpg'))).rejects.toThrow();
    // The referenced sibling is untouched.
    await expect(fs.access(path.join(natureDir, 'a.jpg'))).resolves.toBeUndefined();
  });
});

// ─── SVG day art ────────────────────────────────────────────────

describe('svg day art', () => {
  it('accepts svg uploads into the calendar-art folder', async () => {
    const { POST } = await getHandlers();
    const res = await POST(
      makePostRequest(
        [{ name: 'art.svg', type: 'image/svg+xml', content: Buffer.from('<svg viewBox="0 0 120 80"/>') }],
        'calendar-art',
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.path).toBe('/api/backgrounds/serve?file=calendar-art%2Fart.svg');
    await expect(
      fs.readFile(path.join(bgsDir, 'calendar-art', 'art.svg'), 'utf8'),
    ).resolves.toBeTruthy();
  });

  it('refuses an svg that declares no size, so it cannot stretch on the wall', async () => {
    const { POST } = await getHandlers();
    const res = await POST(
      makePostRequest(
        [{ name: 'shapeless.svg', type: 'image/svg+xml', content: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>') }],
        'calendar-art',
      ),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('shapeless.svg has no size information. Add a viewBox to the SVG and try again.');
    await expect(fs.access(path.join(bgsDir, 'calendar-art', 'shapeless.svg'))).rejects.toThrow();
  });

  it('accepts an svg sized by absolute width and height', async () => {
    const { POST } = await getHandlers();
    const res = await POST(
      makePostRequest(
        [{ name: 'sized.svg', type: 'image/svg+xml', content: Buffer.from('<svg width="300" height="200"/>') }],
        'calendar-art',
      ),
    );
    expect(res.status).toBe(201);
  });

  it('lists svg files in the calendar-art folder', async () => {
    const dir = path.join(bgsDir, 'calendar-art');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'pumpkin.svg'), '<svg/>');
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ directory: 'calendar-art' }));
    expect(await urlsOf(res)).toEqual([
      '/api/backgrounds/serve?file=calendar-art%2Fpumpkin.svg',
    ]);
  });

  it('lists jfif files (a JPEG spelling the upload accepts by MIME type)', async () => {
    const dir = path.join(bgsDir, 'calendar-art');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'pumpkins_dark.jfif'), 'img');
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ directory: 'calendar-art' }));
    expect(await urlsOf(res)).toEqual([
      '/api/backgrounds/serve?file=calendar-art%2Fpumpkins_dark.jfif',
    ]);
  });
});

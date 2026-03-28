import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock auth to be a no-op for all tests
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

let tmpDir: string;
let origCwd: () => string;
let bgsDir: string;

beforeEach(async () => {
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

  it('rejects absolute path traversal (GET)', async () => {
    const { GET } = await getHandlers();
    const res = await GET(makeGetRequest({ directory: '/etc/passwd' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid directory');
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
    const json = await res.json();
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
    const json: string[] = await res.json();

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
    const json: string[] = await res.json();

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
    const json: string[] = await res.json();

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
    const json: string[] = await res.json();
    expect(json).toHaveLength(1);
  });

  it('matches image extensions case-insensitively', async () => {
    const { GET } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'PHOTO.JPG'), 'img');
    await fs.writeFile(path.join(bgsDir, 'art.PNG'), 'img');

    const res = await GET(makeGetRequest());
    const json: string[] = await res.json();
    expect(json).toHaveLength(2);
  });

  it('does not list subdirectories as files', async () => {
    const { GET } = await getHandlers();
    await fs.mkdir(path.join(bgsDir, 'subdir.jpg'));
    await fs.writeFile(path.join(bgsDir, 'real.jpg'), 'img');

    const res = await GET(makeGetRequest());
    const json: string[] = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0]).toContain('real.jpg');
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;
let bgsDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bg-download-test-'));
  bgsDir = path.join(tmpDir, 'public', 'backgrounds');
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  // Reset modules so BGS is recomputed with the new cwd
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function mockFetch(opts: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  body?: Buffer;
}) {
  const {
    ok = true,
    status = 200,
    contentType = 'image/jpeg',
    body = Buffer.from('fake-image-data'),
  } = opts;

  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok,
        status,
        headers: new Headers({ 'content-type': contentType }),
        arrayBuffer: () =>
          Promise.resolve(
            body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
          ),
      }),
    ),
  );
}

/** Import fresh each test so BGS picks up the overridden process.cwd() */
async function callDownload(
  url: string,
  prefix: string,
  options?: { timeout?: number; rejectNonWeb?: boolean; validateImage?: boolean },
) {
  const mod = await import('@/lib/background-download');
  return mod.downloadAndSaveBackground(url, prefix, options);
}

describe('downloadAndSaveBackground', () => {
  describe('filename sanitization', () => {
    it('replaces special characters with underscores', async () => {
      mockFetch({ contentType: 'image/jpeg' });

      const result = await callDownload(
        'https://example.com/img.jpg',
        'hello world!@#$%',
      );
      expect(result.path).toContain('hello_world____');

      const files = await fs.readdir(bgsDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toBe('hello_world_____.jpg');
    });

    it('preserves safe characters: letters, numbers, dots, hyphens, underscores', async () => {
      mockFetch({ contentType: 'image/jpeg' });

      const result = await callDownload(
        'https://example.com/img.jpg',
        'photo-2024_01.test',
      );
      expect(result.path).toContain('photo-2024_01.test.jpg');
    });
  });

  describe('content-type to extension mapping', () => {
    it('uses .png for image/png content type', async () => {
      mockFetch({ contentType: 'image/png' });

      const result = await callDownload('https://example.com/img', 'test');
      expect(result.path).toMatch(/test\.png/);

      const files = await fs.readdir(bgsDir);
      expect(files[0]).toBe('test.png');
    });

    it('uses .webp for image/webp content type', async () => {
      mockFetch({ contentType: 'image/webp' });

      const result = await callDownload('https://example.com/img', 'test');
      expect(result.path).toMatch(/test\.webp/);

      const files = await fs.readdir(bgsDir);
      expect(files[0]).toBe('test.webp');
    });

    it('defaults to .jpg for image/jpeg', async () => {
      mockFetch({ contentType: 'image/jpeg' });

      const result = await callDownload('https://example.com/img', 'test');
      expect(result.path).toMatch(/test\.jpg/);
    });

    it('defaults to .jpg for unknown content types', async () => {
      mockFetch({ contentType: 'application/octet-stream' });

      const result = await callDownload('https://example.com/img', 'test');
      expect(result.path).toMatch(/test\.jpg/);
    });
  });

  describe('fetch failure', () => {
    it('throws when response is not ok', async () => {
      mockFetch({ ok: false, status: 404 });

      await expect(
        callDownload('https://example.com/missing.jpg', 'test'),
      ).rejects.toThrow('Failed to fetch image: 404');
    });

    it('throws on 500 server error', async () => {
      mockFetch({ ok: false, status: 500 });

      await expect(
        callDownload('https://example.com/broken.jpg', 'test'),
      ).rejects.toThrow('Failed to fetch image: 500');
    });
  });

  describe('image validation (validateImage: true)', () => {
    it('rejects non-image content types without image extension', async () => {
      mockFetch({ contentType: 'text/html' });

      await expect(
        callDownload('https://example.com/page', 'test', { validateImage: true }),
      ).rejects.toThrow('URL did not return an image');
    });

    it('rejects application/json content type without image extension', async () => {
      mockFetch({ contentType: 'application/json' });

      await expect(
        callDownload('https://example.com/api/data', 'test', {
          validateImage: true,
        }),
      ).rejects.toThrow('URL did not return an image');
    });

    it('passes when content type is a valid image type', async () => {
      mockFetch({ contentType: 'image/png' });

      const result = await callDownload('https://example.com/whatever', 'test', {
        validateImage: true,
      });
      expect(result.path).toContain('test.png');
    });

    it('passes when URL has image extension even if content-type is wrong', async () => {
      mockFetch({ contentType: 'application/octet-stream' });

      const result = await callDownload(
        'https://example.com/photo.jpg',
        'test',
        { validateImage: true },
      );
      expect(result.path).toContain('test.jpg');
    });

    it('passes when URL has .png extension with query string', async () => {
      mockFetch({ contentType: 'text/plain' });

      const result = await callDownload(
        'https://example.com/photo.png?width=100',
        'test',
        { validateImage: true },
      );
      expect(result.path).toBeDefined();
    });

    it('passes when URL has .webp extension with wrong content-type', async () => {
      mockFetch({ contentType: 'text/html' });

      const result = await callDownload(
        'https://example.com/photo.webp',
        'test',
        { validateImage: true },
      );
      expect(result.path).toBeDefined();
    });

    it('does not validate when validateImage is false (default)', async () => {
      mockFetch({ contentType: 'text/html' });

      // Should NOT throw even with non-image content type
      const result = await callDownload('https://example.com/page', 'test');
      expect(result.path).toBeDefined();
    });
  });

  describe('non-web formats (rejectNonWeb: true)', () => {
    // The module is re-imported per test (see callDownload), so the error
    // class identity differs each time — assert on the name instead.
    async function rejection(url: string) {
      return callDownload(url, 'test', { rejectNonWeb: true }).then(
        () => { throw new Error('expected a rejection'); },
        (err: Error) => err,
      );
    }

    it('rejects a TIFF content type with a message meant for a person', async () => {
      mockFetch({ contentType: 'image/tiff', body: Buffer.from('tiff-data') });

      const err = await rejection('https://example.com/photo.tiff');
      expect(err.name).toBe('UnsupportedImageFormatError');
      expect(err.message).toMatch(/format the display can't show/);
    });

    it('rejects a .tif URL even when the content type is generic', async () => {
      mockFetch({ contentType: 'application/octet-stream', body: Buffer.from('tiff-data') });

      expect((await rejection('https://example.com/photo.tif')).name)
        .toBe('UnsupportedImageFormatError');
    });

    it.each([
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/webp', '.webp'],
      ['image/gif', '.gif'],
      ['image/avif', '.avif'],
    ])('accepts %s and saves it as %s', async (contentType, ext) => {
      mockFetch({ contentType, body: Buffer.from('image-data') });

      const result = await callDownload('https://example.com/photo', 'test', { rejectNonWeb: true });
      expect(result.path).toContain(`test${ext}`);
    });

    it('ignores content-type parameters when matching the format', async () => {
      mockFetch({ contentType: 'image/png; charset=binary', body: Buffer.from('png-data') });

      const result = await callDownload('https://example.com/photo', 'test', { rejectNonWeb: true });
      expect(result.path).toContain('test.png');
    });

    it('saves a TIFF unchanged when rejectNonWeb is off (default)', async () => {
      mockFetch({ contentType: 'image/tiff', body: Buffer.from('tiff-data') });

      const result = await callDownload('https://example.com/photo.tiff', 'test', { rejectNonWeb: false });
      expect(result.path).toContain('test.jpg');
    });
  });

  describe('file written to disk', () => {
    it('creates the backgrounds directory and writes the file', async () => {
      const imageData = Buffer.from('real-image-bytes-here');
      mockFetch({ contentType: 'image/jpeg', body: imageData });

      await callDownload('https://example.com/photo.jpg', 'wallpaper');

      const stat = await fs.stat(bgsDir);
      expect(stat.isDirectory()).toBe(true);

      const written = await fs.readFile(path.join(bgsDir, 'wallpaper.jpg'));
      expect(written).toEqual(imageData);
    });

    it('writes to an existing directory without error', async () => {
      await fs.mkdir(bgsDir, { recursive: true });
      mockFetch({ contentType: 'image/png' });

      const result = await callDownload(
        'https://example.com/photo.png',
        'existing',
      );
      expect(result.path).toContain('existing.png');

      const files = await fs.readdir(bgsDir);
      expect(files).toContain('existing.png');
    });
  });

  describe('return value', () => {
    it('returns a serve URL with encoded filename', async () => {
      mockFetch({ contentType: 'image/jpeg' });

      const result = await callDownload('https://example.com/img.jpg', 'my photo');
      expect(result.path).toBe(
        `/api/backgrounds/serve?file=${encodeURIComponent('my_photo.jpg')}`,
      );
    });
  });
});

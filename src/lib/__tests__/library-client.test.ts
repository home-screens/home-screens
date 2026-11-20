// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteLibraryFile, deleteLibraryFiles, deleteLibraryImage, uploadLibraryFile, uploadLibraryFiles, usageNames } from '@/lib/library-client';
import { isSessionExpired } from '@/lib/editor-fetch';

/**
 * Tests for the shared library-delete helper used by the editor's
 * `useImageLibrary`, the /remote Photos tab and the Pictures & videos page.
 * The interesting parts are the serve-URL parsing (the `file` query param is
 * a library-relative path whose directory/basename split becomes the DELETE
 * body) and folding the server's answer into one typed result, so an
 * in-use refusal reaches every surface with its where-used list.
 */

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sentBody(): { file: string; directory?: string } {
  const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

describe('deleteLibraryImage', () => {
  it('splits a nested path into directory and basename', async () => {
    const res = await deleteLibraryImage('/api/backgrounds/serve?file=vacation%2F2026%2Fbeach.jpg');

    expect(res?.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/backgrounds');
    expect(init.method).toBe('DELETE');
    expect(sentBody()).toEqual({ file: 'beach.jpg', directory: 'vacation/2026' });
  });

  it('omits directory for a root-level file', async () => {
    await deleteLibraryImage('/api/backgrounds/serve?file=beach.jpg');

    expect(sentBody()).toEqual({ file: 'beach.jpg' });
    expect('directory' in sentBody()).toBe(false);
  });

  it('returns null without a request when the URL has no file param', async () => {
    const res = await deleteLibraryImage('/api/backgrounds/serve');

    expect(res).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a plain failure with its status and no usage', async () => {
    mockFetch.mockResolvedValue(new Response('nope', { status: 500 }));

    const res = await deleteLibraryImage('/api/backgrounds/serve?file=beach.jpg');

    expect(res).toEqual({ ok: false, status: 500, usage: [] });
  });
});

describe('deleteLibraryFile', () => {
  it('folds a 409 into the where-used list the server sent', async () => {
    const usage = [{ kind: 'screen', name: 'Hall', configPath: 'screens[0].backgroundImage' }];
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'in use', usage }), { status: 409 }));

    const res = await deleteLibraryFile('nature/a.jpg');

    expect(res).toEqual({ ok: false, status: 409, usage });
    expect(sentBody()).toEqual({ file: 'a.jpg', directory: 'nature' });
  });

  it('treats a 409 without a usable body as refused with no detail', async () => {
    mockFetch.mockResolvedValue(new Response('not json', { status: 409 }));

    const res = await deleteLibraryFile('a.jpg');

    expect(res).toEqual({ ok: false, status: 409, usage: [] });
  });

  it('counts an already-missing file as deleted', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 404 }));

    const res = await deleteLibraryFile('a.jpg');

    expect(res.ok).toBe(true);
  });
});

describe('usageNames', () => {
  it('lists each name once and skips uses without one', () => {
    expect(usageNames([
      { kind: 'screen', name: 'Hall', configPath: 'a' },
      { kind: 'module', name: 'Hall', configPath: 'b' },
      { kind: 'dayRule', configPath: 'c' },
      { kind: 'slideshow', name: 'Den', configPath: 'd' },
    ])).toEqual(['Hall', 'Den']);
  });
});

describe('uploadLibraryFile', () => {
  type Progress = { lengthComputable: boolean; loaded: number; total: number };

  /** Stands in for XMLHttpRequest: records what was sent and lets a test answer. */
  class FakeXhr {
    static sent: FakeXhr[] = [];
    method = '';
    url = '';
    body: FormData | null = null;
    status = 0;
    responseText = '';
    upload: { onprogress: ((e: Progress) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;

    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }

    send(body: FormData) {
      this.body = body;
      FakeXhr.sent.push(this);
    }

    answer(status: number, responseText: string) {
      this.status = status;
      this.responseText = responseText;
      this.onload?.();
    }
  }

  const photo = () => new File(['jpeg bytes'], 'a.jpg', { type: 'image/jpeg' });
  const lastSent = () => FakeXhr.sent[FakeXhr.sent.length - 1];
  let place: { pathname: string; search: string; href: string };

  beforeEach(() => {
    FakeXhr.sent = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    place = { pathname: '/remote', search: '?tab=photos', href: 'http://localhost:3000/remote?tab=photos' };
    vi.stubGlobal('location', place);
  });

  it('posts a form holding the file and its folder', async () => {
    const file = photo();
    const pending = uploadLibraryFile(file, 'Favorites');

    const xhr = lastSent();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/backgrounds');
    expect(xhr.body!.get('file')).toBe(file);
    expect(xhr.body!.get('directory')).toBe('Favorites');
    xhr.answer(201, '{}');
    await pending;
  });

  it('leaves the folder out for the top level', async () => {
    const pending = uploadLibraryFile(photo(), '');

    expect(lastSent().body!.has('file')).toBe(true);
    expect(lastSent().body!.has('directory')).toBe(false);
    lastSent().answer(201, '{}');
    await pending;
  });

  it('reports bytes sent only for progress that knows the total', async () => {
    const onProgress = vi.fn();
    const pending = uploadLibraryFile(photo(), 'Favorites', onProgress);
    const report = lastSent().upload.onprogress!;

    report({ lengthComputable: true, loaded: 100, total: 400 });
    report({ lengthComputable: false, loaded: 200, total: 0 });
    report({ lengthComputable: true, loaded: 400, total: 400 });

    expect(onProgress.mock.calls).toEqual([[100, 400], [400, 400]]);
    lastSent().answer(201, '{}');
    await pending;
  });

  it('hands back the stored file\'s serve URL on a 201', async () => {
    const pending = uploadLibraryFile(photo(), 'Favorites');
    lastSent().answer(201, JSON.stringify({ path: '/api/backgrounds/serve?file=Favorites%2Fa.jpg' }));

    await expect(pending).resolves.toEqual({ ok: true, status: 201, path: '/api/backgrounds/serve?file=Favorites%2Fa.jpg' });
  });

  it('hands back the hub\'s reason on a refusal', async () => {
    const pending = uploadLibraryFile(photo(), 'Favorites');
    lastSent().answer(413, JSON.stringify({ error: 'That picture is too big' }));

    await expect(pending).resolves.toEqual({ ok: false, status: 413, error: 'That picture is too big' });
  });

  it('answers by status alone when the body is not JSON', async () => {
    const refused = uploadLibraryFile(photo(), 'Favorites');
    lastSent().answer(502, '<html>Bad gateway</html>');
    await expect(refused).resolves.toEqual({ ok: false, status: 502 });

    const stored = uploadLibraryFile(photo(), 'Favorites');
    lastSent().answer(201, '');
    await expect(stored).resolves.toEqual({ ok: true, status: 201 });
  });

  it('sends the page to the login screen on a 401 and rejects as an expired session', async () => {
    const pending = uploadLibraryFile(photo(), 'Favorites');
    lastSent().answer(401, '');

    const error = await pending.catch((e: unknown) => e);
    expect(isSessionExpired(error)).toBe(true);
    expect(place.href).toBe(`/login?from=${encodeURIComponent('/remote?tab=photos')}`);
  });

  it.each(['onerror', 'onabort'] as const)('rejects when the request ends with %s', async (handler) => {
    const pending = uploadLibraryFile(photo(), 'Favorites');
    lastSent()[handler]!();

    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(isSessionExpired(error)).toBe(false);
    expect(place.href).toBe('http://localhost:3000/remote?tab=photos');
  });
});

/** A file whose first bytes say what `videoCodecOfFile` should find. */
function mp4(name: string, codec: 'avc1' | 'hvc1'): File {
  const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const box = (type: string, body: number[]) => {
    const size = 8 + body.length;
    return [(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...text(type), ...body];
  };
  // moov > trak > mdia > minf > stbl > stsd > one sample entry.
  const entry = box(codec, new Array(78).fill(0));
  const stsd = box('stsd', [0, 0, 0, 0, 0, 0, 0, 1, ...entry]);
  const moov = box('moov', box('trak', box('mdia', box('minf', box('stbl', stsd)))));
  return new File([new Uint8Array([...box('ftyp', text('isom')), ...moov])], name, { type: 'video/mp4' });
}

describe('uploadLibraryFiles', () => {
  const posts = () => mockFetch.mock.calls.filter(([, init]) => (init as RequestInit).method === 'POST').map(([, init]) => (init as RequestInit).body as FormData);

  it('sends one request per file into the folder and gathers what the hub kept', async () => {
    mockFetch.mockImplementation(async (_url, init) => {
      const name = ((init as RequestInit).body as FormData).get('file') as File;
      return new Response(JSON.stringify({ path: `/api/backgrounds/serve?file=trips%2F${name.name}` }), { status: 200 });
    });
    const outcome = await uploadLibraryFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.png', { type: 'image/png' })], 'trips');
    expect(outcome).toEqual({ uploaded: ['/api/backgrounds/serve?file=trips%2Fa.jpg', '/api/backgrounds/serve?file=trips%2Fb.png'], unplayable: [], error: null });
    expect(posts().map((body) => [(body.get('file') as File).name, body.get('directory')])).toEqual([['a.jpg', 'trips'], ['b.png', 'trips']]);
  });

  it('holds back a video the wall cannot play and still sends the rest', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ path: '/api/backgrounds/serve?file=ok.mp4' }), { status: 200 }));
    const outcome = await uploadLibraryFiles([mp4('IMG_0042.mp4', 'hvc1'), mp4('ok.mp4', 'avc1')], '');
    expect(outcome.unplayable).toEqual(['IMG_0042.mp4']);
    expect(outcome.uploaded).toEqual(['/api/backgrounds/serve?file=ok.mp4']);
    expect(posts().map((body) => (body.get('file') as File).name)).toEqual(['ok.mp4']);
  });

  it('puts one file in place of another, with no folder', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ path: '/api/backgrounds/serve?file=nature%2Flake.jpg' }), { status: 200 }));
    await uploadLibraryFiles([new File(['a'], 'new.jpg', { type: 'image/jpeg' })], 'ignored', { replacePath: 'nature/lake.jpg' });
    const [body] = posts();
    expect(body.get('replace')).toBe('nature/lake.jpg');
    expect(body.get('directory')).toBeNull();
  });

  it('names the file the hub turned down, with its sentence and status', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Too big' }), { status: 413 }));
    const outcome = await uploadLibraryFiles([new File(['a'], 'big.jpg', { type: 'image/jpeg' })], '');
    expect(outcome).toEqual({ uploaded: [], unplayable: [], error: { message: 'Too big', status: 413, file: 'big.jpg' } });
  });
});

describe('deleteLibraryFiles', () => {
  it('sorts each file into deleted, kept with its uses, or failed', async () => {
    const usage = [{ kind: 'screen', name: 'Hall', configPath: 'screens[0].backgroundImage' }];
    mockFetch
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ usage }), { status: 409 }))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockRejectedValueOnce(new Error('offline'));
    expect(await deleteLibraryFiles(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'])).toEqual({ deleted: ['a.jpg'], kept: [{ path: 'b.jpg', usage }], failed: 2 });
  });
});

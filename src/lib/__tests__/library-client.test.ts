import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteLibraryImage } from '@/lib/library-client';

/**
 * Tests for the shared library-delete helper used by both the editor's
 * `useImageLibrary` and the /remote Photos tab. The interesting part is the
 * serve-URL parsing: the `file` query param is a library-relative path whose
 * directory/basename split becomes the DELETE body.
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

  it('returns the response for the caller to branch on failure', async () => {
    mockFetch.mockResolvedValue(new Response('nope', { status: 500 }));

    const res = await deleteLibraryImage('/api/backgrounds/serve?file=beach.jpg');

    expect(res?.ok).toBe(false);
  });
});

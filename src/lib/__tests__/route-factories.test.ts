import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createImageDownloadHandler, createTagActionRoute } from '@/lib/route-factories';
import { silenceConsole } from '@/test-utils';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/background-download', () => ({
  downloadAndSaveBackground: vi.fn(),
}));

vi.mock('@/lib/url-safety', () => ({
  isSafeExternalUrl: vi.fn(),
}));

import { downloadAndSaveBackground } from '@/lib/background-download';
import { isSafeExternalUrl } from '@/lib/url-safety';

const mockDownload = vi.mocked(downloadAndSaveBackground);
const mockIsSafe = vi.mocked(isSafeExternalUrl);

silenceConsole();

beforeEach(() => {
  vi.restoreAllMocks();
  mockIsSafe.mockResolvedValue(true);
  mockDownload.mockResolvedValue({ path: '/backgrounds/test.jpg' });
});

// ── createImageDownloadHandler ──────────────────────────────────────────

describe('createImageDownloadHandler', () => {
  function makeHandler(overrides: Partial<Parameters<typeof createImageDownloadHandler>[0]> = {}) {
    return createImageDownloadHandler({
      defaultPrefix: 'test',
      errorMsg: 'Download failed',
      ...overrides,
    });
  }

  function postRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('returns 400 when imageUrl is missing', async () => {
    const handler = makeHandler();
    const res = await handler(postRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing imageUrl');
  });

  it('returns 400 when imageUrl is not a safe external URL', async () => {
    mockIsSafe.mockResolvedValue(false);
    const handler = makeHandler();
    const res = await handler(postRequest({ imageUrl: 'http://169.254.169.254/secret' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid image URL');
  });

  it('downloads and returns 201 on success', async () => {
    const handler = makeHandler();
    const res = await handler(postRequest({ imageUrl: 'https://example.com/photo.jpg' }));
    expect(res.status).toBe(201);
    expect(mockDownload).toHaveBeenCalledWith(
      'https://example.com/photo.jpg',
      expect.stringContaining('test-'),
      undefined,
    );
  });

  it('uses provided filename instead of default prefix', async () => {
    const handler = makeHandler();
    const res = await handler(postRequest({ imageUrl: 'https://example.com/img.jpg', filename: 'custom-name' }));
    expect(res.status).toBe(201);
    expect(mockDownload).toHaveBeenCalledWith(
      'https://example.com/img.jpg',
      'custom-name',
      undefined,
    );
  });

  it('passes downloadOptions to downloadAndSaveBackground', async () => {
    const handler = makeHandler({ downloadOptions: { convertNonWeb: true, validateImage: true } });
    await handler(postRequest({ imageUrl: 'https://example.com/img.tiff' }));
    expect(mockDownload).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { convertNonWeb: true, validateImage: true },
    );
  });

  it('calls beforeDownload hook with full body', async () => {
    const beforeDownload = vi.fn();
    const handler = makeHandler({ beforeDownload });
    const body = { imageUrl: 'https://example.com/img.jpg', downloadUrl: 'https://api.unsplash.com/track', extra: 'data' };
    await handler(postRequest(body));
    expect(beforeDownload).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://example.com/img.jpg',
      downloadUrl: 'https://api.unsplash.com/track',
      extra: 'data',
    }));
  });
});

// ── createTagActionRoute ────────────────────────────────────────────────

describe('createTagActionRoute', () => {
  function postRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('returns 409 when busy check returns true', async () => {
    const actionFn = vi.fn();
    const handler = createTagActionRoute(actionFn, {
      busyCheck: () => true,
      verb: 'Upgrade',
      errorMsg: 'Failed',
    });

    const res = await handler(postRequest({ tag: '1.0.0' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('An upgrade is already in progress');
    expect(actionFn).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid tag', async () => {
    const actionFn = vi.fn();
    const handler = createTagActionRoute(actionFn, {
      busyCheck: () => false,
      verb: 'Upgrade',
      errorMsg: 'Failed',
    });

    const res = await handler(postRequest({ tag: 'invalid' }));
    expect(res.status).toBe(400);
    expect(actionFn).not.toHaveBeenCalled();
  });

  it('starts action and returns success for valid tag', async () => {
    const actionFn = vi.fn().mockResolvedValue(undefined);
    const handler = createTagActionRoute(actionFn, {
      busyCheck: () => false,
      verb: 'Upgrade',
      errorMsg: 'Failed',
    });

    const res = await handler(postRequest({ tag: '2.1.0' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message).toBe('Upgrade to 2.1.0 started');
    expect(actionFn).toHaveBeenCalledWith('2.1.0');
  });

  it('uses the verb in the success message', async () => {
    const actionFn = vi.fn().mockResolvedValue(undefined);
    const handler = createTagActionRoute(actionFn, {
      busyCheck: () => false,
      verb: 'Rollback',
      errorMsg: 'Failed',
    });

    const res = await handler(postRequest({ tag: 'v1.0.0' }));
    const json = await res.json();
    expect(json.message).toBe('Rollback to v1.0.0 started');
  });
});

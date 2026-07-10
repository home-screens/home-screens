import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock secrets and api-utils before importing immich
vi.mock('../secrets', () => ({
  getSecret: vi.fn(),
}));

vi.mock('../api-utils', () => ({
  fetchWithTimeout: vi.fn(),
}));

import { getSecret } from '../secrets';
import { fetchWithTimeout } from '../api-utils';
import { getImmichConfig, immichFetch, validateImmichConnection, parseImmichDurationMs } from '../immich';

const mockGetSecret = vi.mocked(getSecret);
const mockFetch = vi.mocked(fetchWithTimeout);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getImmichConfig ───────────────────────────────────────────

describe('getImmichConfig', () => {
  it('returns null when immich_url is missing', async () => {
    mockGetSecret.mockImplementation(async (key) =>
      key === 'immich_api_key' ? 'my-key' : null,
    );
    expect(await getImmichConfig()).toBeNull();
  });

  it('returns null when immich_api_key is missing', async () => {
    mockGetSecret.mockImplementation(async (key) =>
      key === 'immich_url' ? 'http://immich:2283' : null,
    );
    expect(await getImmichConfig()).toBeNull();
  });

  it('returns config when both secrets are set', async () => {
    mockGetSecret.mockImplementation(async (key) => {
      if (key === 'immich_url') return 'http://immich:2283';
      if (key === 'immich_api_key') return 'my-key';
      return null;
    });
    const cfg = await getImmichConfig();
    expect(cfg).toEqual({ url: 'http://immich:2283', apiKey: 'my-key' });
  });

  it('strips trailing slashes from URL', async () => {
    mockGetSecret.mockImplementation(async (key) => {
      if (key === 'immich_url') return 'http://immich:2283///';
      if (key === 'immich_api_key') return 'my-key';
      return null;
    });
    const cfg = await getImmichConfig();
    expect(cfg!.url).toBe('http://immich:2283');
  });
});

// ── immichFetch ───────────────────────────────────────────────

describe('immichFetch', () => {
  it('throws when Immich is not configured', async () => {
    mockGetSecret.mockResolvedValue(null);
    await expect(immichFetch('/api/albums')).rejects.toThrow('Immich not configured');
  });

  it('prepends base URL and injects x-api-key header', async () => {
    mockGetSecret.mockImplementation(async (key) => {
      if (key === 'immich_url') return 'http://immich:2283';
      if (key === 'immich_api_key') return 'secret-key';
      return null;
    });
    mockFetch.mockResolvedValue(new Response('ok'));

    await immichFetch('/api/albums');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://immich:2283/api/albums',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'secret-key' }),
      }),
    );
  });

  it('merges caller-provided headers with the API key', async () => {
    mockGetSecret.mockImplementation(async (key) => {
      if (key === 'immich_url') return 'http://immich:2283';
      if (key === 'immich_api_key') return 'secret-key';
      return null;
    });
    mockFetch.mockResolvedValue(new Response('ok'));

    await immichFetch('/api/search/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init?.headers).toEqual(
      expect.objectContaining({
        'x-api-key': 'secret-key',
        'Content-Type': 'application/json',
      }),
    );
    expect((init as { method?: string }).method).toBe('POST');
  });

  it('forwards timeout to fetchWithTimeout', async () => {
    mockGetSecret.mockImplementation(async (key) => {
      if (key === 'immich_url') return 'http://immich:2283';
      if (key === 'immich_api_key') return 'key';
      return null;
    });
    mockFetch.mockResolvedValue(new Response('ok'));

    await immichFetch('/api/ping', { timeout: 5000 });

    const [, init] = mockFetch.mock.calls[0];
    expect((init as { timeout?: number }).timeout).toBe(5000);
  });
});

// ── validateImmichConnection ──────────────────────────────────

describe('validateImmichConnection', () => {
  function setupSecrets() {
    mockGetSecret.mockImplementation(async (key) => {
      if (key === 'immich_url') return 'http://immich:2283';
      if (key === 'immich_api_key') return 'key';
      return null;
    });
  }

  it('returns not reachable when config is null', async () => {
    mockGetSecret.mockResolvedValue(null);
    const result = await validateImmichConnection();
    expect(result).toEqual({ reachable: false, authenticated: false });
  });

  it('returns not reachable when ping fails', async () => {
    setupSecrets();
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await validateImmichConnection();
    expect(result).toEqual({ reachable: false, authenticated: false });
  });

  it('returns not reachable when ping returns non-ok', async () => {
    setupSecrets();
    mockFetch.mockResolvedValue(new Response('', { status: 500 }));
    const result = await validateImmichConnection();
    expect(result).toEqual({ reachable: false, authenticated: false });
  });

  it('returns reachable but not authenticated when about fails', async () => {
    setupSecrets();
    mockFetch
      .mockResolvedValueOnce(new Response('pong', { status: 200 })) // ping
      .mockResolvedValueOnce(new Response('', { status: 401 })); // about
    const result = await validateImmichConnection();
    expect(result).toEqual({ reachable: true, authenticated: false });
  });

  it('returns reachable but not authenticated when about throws', async () => {
    setupSecrets();
    mockFetch
      .mockResolvedValueOnce(new Response('pong', { status: 200 })) // ping
      .mockRejectedValueOnce(new Error('timeout')); // about
    const result = await validateImmichConnection();
    expect(result).toEqual({ reachable: true, authenticated: false });
  });

  it('returns fully connected with version on success', async () => {
    setupSecrets();
    mockFetch
      .mockResolvedValueOnce(new Response('pong', { status: 200 })) // ping
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ version: '1.106.4' }), { status: 200 }),
      ); // about
    const result = await validateImmichConnection();
    expect(result).toEqual({ reachable: true, authenticated: true, version: '1.106.4' });
  });

  it('strips the leading v from Immich v3 version strings', async () => {
    setupSecrets();
    mockFetch
      .mockResolvedValueOnce(new Response('pong', { status: 200 })) // ping
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ version: 'v3.0.1' }), { status: 200 }),
      ); // about
    const result = await validateImmichConnection();
    expect(result).toEqual({ reachable: true, authenticated: true, version: '3.0.1' });
  });
});

describe('parseImmichDurationMs', () => {
  it('parses the nominal H:MM:SS.mmm shape', () => {
    expect(parseImmichDurationMs('0:00:30.00000')).toBe(30_000);
    expect(parseImmichDurationMs('0:01:05.500')).toBe(65_500);
    expect(parseImmichDurationMs('1:00:00')).toBe(3_600_000);
  });

  it('returns null for zero, absent, and malformed durations', () => {
    expect(parseImmichDurationMs('0:00:00.00000')).toBeNull();
    expect(parseImmichDurationMs(null)).toBeNull();
    expect(parseImmichDurationMs(undefined)).toBeNull();
    expect(parseImmichDurationMs('')).toBeNull();
    expect(parseImmichDurationMs('not-a-duration')).toBeNull();
  });

  it('returns null (instead of throwing) for non-string values real servers send', () => {
    // Regression: a live Immich server returned a non-string here, which
    // crashed /api/immich/photos with "duration.trim is not a function".
    expect(parseImmichDurationMs(30.5 as unknown)).toBeNull();
    expect(parseImmichDurationMs(0 as unknown)).toBeNull();
    expect(parseImmichDurationMs({ seconds: 30 } as unknown)).toBeNull();
    expect(parseImmichDurationMs(true as unknown)).toBeNull();
  });
});

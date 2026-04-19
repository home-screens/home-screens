import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/secrets', () => ({
  getSecretStatus: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  isValidSecretKey: vi.fn(() => true),
}));

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  const fetchWithTimeout = vi.fn((...args: unknown[]) => (globalThis.fetch as (...a: unknown[]) => unknown)(...args));
  return {
    ...actual,
    errorResponse: vi.fn((_err: unknown, msg: string, status = 500) => {
      return Response.json({ error: msg }, { status });
    }),
    fetchWithTimeout,
    validateTodoistToken: vi.fn(async (token: string) => {
      const res = await fetchWithTimeout('https://api.todoist.com/api/v1/projects', {
        headers: { Authorization: `Bearer ${token}` },
      }) as Response;
      if (!res.ok) return { valid: false, status: (res as Response).status };
      return { valid: true };
    }),
  };
});

import { getSecretStatus, setSecret, deleteSecret, isValidSecretKey } from '@/lib/secrets';
import { requireSession } from '@/lib/auth';

const { GET, PUT, DELETE } = await import('@/app/api/secrets/route');

function makeRequest(
  method: string,
  body?: Record<string, unknown>,
): NextRequest {
  return new NextRequest('http://localhost/api/secrets', {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isValidSecretKey).mockReturnValue(true);
});

// ─── GET ───

describe('GET /api/secrets', () => {
  it('returns auth error when not authenticated', async () => {
    vi.mocked(requireSession).mockRejectedValue(
      Response.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns secret status on success', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);
    const mockStatus = {
      openweathermap_key: true,
      weatherapi_key: false,
      pirateweather_key: false,
      metoffice_key: false,
      unsplash_access_key: false,
      nasa_api_key: false,
      todoist_token: true,
      google_maps_key: false,
      tomtom_key: false,
      google_client_id: false,
      google_client_secret: false,
      github_token: false,
      immich_url: false,
      immich_api_key: false,
    };
    vi.mocked(getSecretStatus).mockResolvedValue(mockStatus);

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockStatus);
  });
});

// ─── PUT ───

describe('PUT /api/secrets', () => {
  it('returns auth error when not authenticated', async () => {
    vi.mocked(requireSession).mockRejectedValue(
      Response.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await PUT(makeRequest('PUT', { key: 'test_key', value: 'test_value' }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when key is missing', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);

    const res = await PUT(makeRequest('PUT', { value: 'some_value' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/Missing required fields/);
  });

  it('returns 400 when value is missing', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);

    const res = await PUT(makeRequest('PUT', { key: 'test_key' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/Missing required fields/);
  });

  it('returns 400 when value is empty/whitespace only', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);

    const res = await PUT(makeRequest('PUT', { key: 'test_key', value: '   ' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/Missing required fields/);
  });

  it('returns 400 for invalid secret key', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);
    vi.mocked(isValidSecretKey).mockReturnValue(false);

    const res = await PUT(makeRequest('PUT', { key: 'invalid_key', value: 'some_value' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/Invalid secret key/);
    expect(json.error).toContain('invalid_key');
  });

  it('validates Todoist token when key is todoist_token', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

    const res = await PUT(makeRequest('PUT', { key: 'todoist_token', value: 'valid-token' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.todoist.com/api/v1/projects',
      expect.objectContaining({
        headers: { Authorization: 'Bearer valid-token' },
      }),
    );
  });

  it('returns 401 when Todoist token validation fails', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    const res = await PUT(makeRequest('PUT', { key: 'todoist_token', value: 'bad-token' }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toMatch(/Invalid Todoist token/);
    expect(setSecret).not.toHaveBeenCalled();
  });

  it('saves secret on success', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);

    const res = await PUT(makeRequest('PUT', { key: 'openweathermap_key', value: 'abc123' }));

    expect(res.status).toBe(200);
    expect(setSecret).toHaveBeenCalledWith('openweathermap_key', 'abc123');
  });

  it('returns { ok: true } on success', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);

    const res = await PUT(makeRequest('PUT', { key: 'openweathermap_key', value: 'abc123' }));
    const json = await res.json();

    expect(json).toEqual({ ok: true });
  });

  it('does not validate token via fetch for non-todoist keys', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);
    global.fetch = vi.fn();

    const res = await PUT(makeRequest('PUT', { key: 'openweathermap_key', value: 'key123' }));

    expect(res.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ─── DELETE ───

describe('DELETE /api/secrets', () => {
  it('returns auth error when not authenticated', async () => {
    vi.mocked(requireSession).mockRejectedValue(
      Response.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await DELETE(makeRequest('DELETE', { key: 'test_key' }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when key is missing', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);

    const res = await DELETE(makeRequest('DELETE', {}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/Missing required field: key/);
  });

  it('returns 400 for invalid secret key', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);
    vi.mocked(isValidSecretKey).mockReturnValue(false);

    const res = await DELETE(makeRequest('DELETE', { key: 'bad_key' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/Invalid secret key/);
    expect(json.error).toContain('bad_key');
  });

  it('deletes secret on success', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);

    const res = await DELETE(makeRequest('DELETE', { key: 'openweathermap_key' }));

    expect(res.status).toBe(200);
    expect(deleteSecret).toHaveBeenCalledWith('openweathermap_key');
  });

  it('returns { ok: true } on success', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);

    const res = await DELETE(makeRequest('DELETE', { key: 'openweathermap_key' }));
    const json = await res.json();

    expect(json).toEqual({ ok: true });
  });
});

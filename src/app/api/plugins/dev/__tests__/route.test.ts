import { describe, it, expect, beforeEach, vi } from 'vitest';

// Bypass session auth while preserving the withAuth error wrapper.
vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return {
    ...actual,
    withAuth: (
      handler: (req: unknown, ctx: unknown) => Promise<Response>,
      errorMsg: string,
    ) => async (req: unknown, ctx: unknown) => {
      try {
        return await handler(req, ctx);
      } catch (err) {
        if (err instanceof Response) return err;
        return actual.errorResponse(err, errorMsg);
      }
    },
  };
});

// Keep the REAL validateManifest (that's the guard under test); stub only the
// disk-writing registration.
vi.mock('@/lib/plugins', async () => {
  const actual = await vi.importActual<typeof import('@/lib/plugins')>('@/lib/plugins');
  return {
    ...actual,
    registerDevPlugin: vi.fn(async () => undefined),
  };
});

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { registerDevPlugin } from '@/lib/plugins';

const mockRegister = vi.mocked(registerDevPlugin);

function makeRequest(body: unknown, raw = false): NextRequest {
  return new NextRequest('http://localhost/api/plugins/dev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

const VALID = {
  id: 'dev-plugin',
  name: 'Dev Plugin',
  version: '0.0.1',
  moduleType: 'dev-widget',
  category: 'fun',
};

beforeEach(() => {
  mockRegister.mockReset();
  mockRegister.mockResolvedValue(undefined);
});

describe('POST /api/plugins/dev', () => {
  it('returns 400 on malformed JSON body', async () => {
    const res = await POST(makeRequest('{not json', true));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid json/i);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('returns 400 when no manifest is provided', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid manifest/i);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('returns 400 for a manifest missing required fields, naming the field', async () => {
    const res = await POST(makeRequest({ manifest: { id: 'x', name: 'X' } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('"version"');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('returns 400 for a manifest id that is not directory-safe', async () => {
    // "foo/bar" survives naive validation but would collide after
    // sanitization; validateManifest must reject it up front.
    const res = await POST(makeRequest({ manifest: { ...VALID, id: 'foo/bar' } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('"id"');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('rejects wildcard allowedDomains without the localNetwork permission', async () => {
    const res = await POST(makeRequest({
      manifest: { ...VALID, allowedDomains: ['*'] },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/localNetwork/);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('allows wildcard allowedDomains WITH the localNetwork permission', async () => {
    const res = await POST(makeRequest({
      manifest: { ...VALID, allowedDomains: ['*'], permissions: ['localNetwork'] },
    }));
    expect(res.status).toBe(200);
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('registers a valid manifest and returns ok', async () => {
    const res = await POST(makeRequest({ manifest: VALID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({ id: 'dev-plugin' }));
  });

  it('returns 500 when registration itself fails', async () => {
    mockRegister.mockRejectedValueOnce(new Error('disk full'));
    const res = await POST(makeRequest({ manifest: VALID }));
    expect(res.status).toBe(500);
  });
});

/**
 * Route-level tests for `/api/plugins/secrets/[pluginId]` (GET/PUT/DELETE).
 *
 * Mocks `getPluginManifest` (the plugin-exists gate) and the `plugin-secrets`
 * store. Covers the 404 when the plugin is unknown, the status GET, the
 * set/delete happy paths, and the missing-field 400s. The real `parseJsonBody`
 * runs. Auth stubbed at `requireSession`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/plugin-utils', () => ({
  getPluginManifest: vi.fn(),
}));

vi.mock('@/lib/plugin-secrets', () => ({
  getPluginSecretStatus: vi.fn(async () => ({ apiKey: true })),
  setPluginSecret: vi.fn(async () => {}),
  deletePluginSecret: vi.fn(async () => {}),
}));

import { NextRequest } from 'next/server';
import { GET, PUT, DELETE } from '../route';
import { getPluginManifest } from '@/lib/plugin-utils';
import { getPluginSecretStatus, setPluginSecret, deletePluginSecret } from '@/lib/plugin-secrets';

const mockManifest = vi.mocked(getPluginManifest);
const mockStatus = vi.mocked(getPluginSecretStatus);
const mockSet = vi.mocked(setPluginSecret);
const mockDelete = vi.mocked(deletePluginSecret);

const ctx = { params: Promise.resolve({ pluginId: 'weather-plus' }) };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/plugins/secrets/weather-plus', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('/api/plugins/secrets/[pluginId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockManifest.mockResolvedValue({ id: 'weather-plus' } as never);
    mockStatus.mockResolvedValue({ apiKey: true });
  });

  it('GET returns 404 for an unknown plugin', async () => {
    mockManifest.mockResolvedValue(null);
    const res = await GET(req('GET'), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/Plugin not found/);
  });

  it('GET returns the per-key configured status', async () => {
    const res = await GET(req('GET'), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ keys: { apiKey: true } });
  });

  it('PUT returns 404 for an unknown plugin', async () => {
    mockManifest.mockResolvedValue(null);
    const res = await PUT(req('PUT', { key: 'apiKey', value: 'x' }), ctx);
    expect(res.status).toBe(404);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('PUT rejects a missing key or empty value with 400', async () => {
    const res = await PUT(req('PUT', { key: 'apiKey', value: '   ' }), ctx);
    expect(res.status).toBe(400);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('PUT stores a secret value', async () => {
    const res = await PUT(req('PUT', { key: 'apiKey', value: 'sk-123' }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSet).toHaveBeenCalledWith('weather-plus', 'apiKey', 'sk-123');
  });

  it('DELETE rejects a missing key with 400', async () => {
    const res = await DELETE(req('DELETE', {}), ctx);
    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('DELETE removes a secret', async () => {
    const res = await DELETE(req('DELETE', { key: 'apiKey' }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDelete).toHaveBeenCalledWith('weather-plus', 'apiKey');
  });
});

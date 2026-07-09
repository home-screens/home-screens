import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/plugins', async () => {
  const actual = await vi.importActual<typeof import('@/lib/plugins')>('@/lib/plugins');
  return {
    ...actual,
    fetchRegistry: vi.fn(),
  };
});

import { GET } from '../route';
import { fetchRegistry } from '@/lib/plugins';
import type { PluginRegistry } from '@/types/plugins';

const mockRegistry = vi.mocked(fetchRegistry);

const REGISTRY: PluginRegistry = {
  schemaVersion: 1,
  lastUpdated: '2026-01-01',
  plugins: [
    {
      id: 'demo',
      name: 'Demo',
      description: 'd',
      author: 'a',
      repo: 'https://example.com/repo',
      license: 'MIT',
      category: 'fun',
      tags: ['x'],
      icon: 'box',
      verified: true,
      versions: [
        {
          version: '1.0.0',
          minAppVersion: '0.0.0',
          releaseDate: '2026-01-01',
          downloadUrl: 'https://example.com/demo.tgz',
          sha256: 'a'.repeat(64),
        },
      ],
    },
  ],
};

beforeEach(() => {
  mockRegistry.mockReset();
});

describe('GET /api/plugins/registry', () => {
  it('returns the parsed registry on success', async () => {
    mockRegistry.mockResolvedValue(REGISTRY);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(REGISTRY);
  });

  it('fails safe with a 500 (and no leaked detail) when the remote catalog errors', async () => {
    mockRegistry.mockRejectedValue(new Error('Registry fetch failed: 503'));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to fetch plugin registry/i);
    // publicErrorResponse must not surface the underlying error message.
    expect(body.detail).toBeUndefined();
  });
});

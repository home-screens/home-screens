import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { PluginManifest } from '@/types/plugins';
import type { ScreenConfiguration } from '@/types/config';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/plugin-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/plugin-utils')>();
  return { ...actual, getPluginManifest: vi.fn() };
});

vi.mock('@/lib/config', () => ({ updateConfigAtomic: vi.fn() }));

import { getPluginManifest } from '@/lib/plugin-utils';
import { updateConfigAtomic } from '@/lib/config';
import { POST } from '@/app/api/plugins/migrate-config/route';

const mockManifest = vi.mocked(getPluginManifest);
const mockUpdate = vi.mocked(updateConfigAtomic);

function req(body: unknown) {
  return new NextRequest('http://localhost/api/plugins/migrate-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test',
    version: '2.0.0',
    moduleType: 'test',
    icon: 'box',
    defaultConfig: {},
    defaultSize: { w: 200, h: 200 },
    exports: { component: 'default' },
    configMigrations: { '1.1.0': { renames: { oldKey: 'newKey' } } },
    ...overrides,
  } as PluginManifest;
}

/** A config whose only plugin module lives on a display, not in the legacy pool. */
function displayOwnedConfig(): ScreenConfiguration {
  return {
    version: 4,
    settings: {},
    screens: [],
    displays: [
      {
        id: 'kitchen',
        name: 'Kitchen',
        screens: [
          {
            id: 's1',
            name: 'S1',
            modules: [
              { id: 'm1', type: 'plugin:test', x: 0, y: 0, w: 2, h: 2, config: { oldKey: 'v' } },
            ],
          },
        ],
      },
    ],
  } as unknown as ScreenConfiguration;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockManifest.mockResolvedValue(manifest());
  // Default: run the mutator against a config and hand back its result.
  mockUpdate.mockImplementation(async (mutator) => mutator(displayOwnedConfig()));
});

describe('POST /api/plugins/migrate-config', () => {
  it('rejects a non-JSON body', async () => {
    const res = await POST(req('not json'), undefined);
    expect(res.status).toBe(400);
  });

  it('rejects a missing plugin id', async () => {
    const res = await POST(req({ oldVersion: '1.0.0' }), undefined);
    expect(res.status).toBe(400);
  });

  it('rejects a plugin id that fails the id pattern', async () => {
    const res = await POST(req({ pluginId: '../etc/passwd', oldVersion: '1.0.0' }), undefined);
    expect(res.status).toBe(400);
  });

  it('rejects a missing oldVersion', async () => {
    const res = await POST(req({ pluginId: 'test-plugin' }), undefined);
    expect(res.status).toBe(400);
  });

  it('404s when the plugin is not installed', async () => {
    mockManifest.mockResolvedValue(null);
    const res = await POST(req({ pluginId: 'test-plugin', oldVersion: '1.0.0' }), undefined);
    expect(res.status).toBe(404);
  });

  it('reads the manifest from disk rather than trusting the request body', async () => {
    // A caller-supplied manifest must be ignored — otherwise a client could
    // inject arbitrary migration rules into the stored config.
    const res = await POST(
      req({
        pluginId: 'test-plugin',
        oldVersion: '1.0.0',
        manifest: manifest({ configMigrations: { '1.1.0': { defaults: { injected: true } } } }),
      }),
      undefined,
    );
    expect(res.status).toBe(200);
    expect(mockManifest).toHaveBeenCalledWith('test-plugin');

    const migrated = await mockUpdate.mock.results[0].value;
    const modConfig = migrated.displays[0].screens[0].modules[0].config;
    expect(modConfig).not.toHaveProperty('injected');
    expect(modConfig).toEqual({ newKey: 'v' });
  });

  // The bug this route exists to fix: the old client-side version walked only
  // `config.screens`, so every instance on every added display was skipped.
  it('migrates modules owned by a display', async () => {
    const res = await POST(req({ pluginId: 'test-plugin', oldVersion: '1.0.0' }), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, changed: true });

    const migrated = await mockUpdate.mock.results[0].value;
    expect(migrated.displays[0].screens[0].modules[0].config).toEqual({ newKey: 'v' });
  });

  it('returns a NEW object when something changed so the write is not skipped', async () => {
    let handedIn: ScreenConfiguration | null = null;
    mockUpdate.mockImplementation(async (mutator) => {
      handedIn = displayOwnedConfig();
      return mutator(handedIn);
    });

    await POST(req({ pluginId: 'test-plugin', oldVersion: '1.0.0' }), undefined);

    const returned = await mockUpdate.mock.results[0].value;
    // updateConfigAtomic skips the disk write when the mutator returns the
    // reference it was given, so an in-place migration must not do that.
    expect(returned).not.toBe(handedIn);
  });

  it('returns the SAME object when nothing changed so the write is skipped', async () => {
    let handedIn: ScreenConfiguration | null = null;
    mockUpdate.mockImplementation(async (mutator) => {
      handedIn = {
        version: 4,
        settings: {},
        screens: [],
        displays: [],
      } as unknown as ScreenConfiguration;
      return mutator(handedIn);
    });

    const res = await POST(req({ pluginId: 'test-plugin', oldVersion: '1.0.0' }), undefined);
    expect(await res.json()).toEqual({ ok: true, changed: false });

    const returned = await mockUpdate.mock.results[0].value;
    expect(returned).toBe(handedIn);
  });
});

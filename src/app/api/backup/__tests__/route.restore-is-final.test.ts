import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { flatten, loadDict } from '@/i18n/__tests__/helpers/dict';

/**
 * Restoring a backup replaces config, family, chores, chore history, meals,
 * rewards, routines, to-dos and timetables in one commit, and keeps no copy of
 * what it replaced: `rollbackOnError` unwinds a FAILED write, and a successful
 * one leaves nothing behind. The only writer of `data/backups/` is the
 * migration snapshot (`config-migration-backup.ts`), which the restore path
 * never calls.
 *
 * So the confirmation the user reads before pressing the button must not offer
 * an undo. This test is the pair: the behaviour above and the sentence that
 * describes it, asserted together, so neither can drift on its own.
 */

// Auth is the only stub. The rest runs for real against the per-worker
// sandbox `data/` (see vitest.setup.ts), which is what makes "nothing was
// written to data/backups" a real observation rather than a mock assertion.
vi.mock('@/lib/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auth')>()),
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { POST } from '@/app/api/backup/route';
import { writeConfig } from '@/lib/config';
import { seedDataFile } from '@/test-utils';
import { getLatestSchemaVersion } from '@/lib/migrations';
import type { ScreenConfiguration } from '@/types/config';

function config(name: string): ScreenConfiguration {
  return {
    version: getLatestSchemaVersion(),
    screens: [{ id: 'default', name, modules: [] }],
    settings: { rotationIntervalMs: 30000, displayWidth: 1080, displayHeight: 1920 },
  } as unknown as ScreenConfiguration;
}

async function backupFiles(): Promise<string[]> {
  try {
    return await fs.readdir(path.join(process.cwd(), 'data', 'backups'));
  } catch {
    return [];
  }
}

function restoreRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await writeConfig(config('Today'));
  await seedDataFile('data/chores.json', { chores: [] });
  await seedDataFile('data/family.json', { members: [], migrated: true });
  await fs.rm(path.join(process.cwd(), 'data', 'backups'), { recursive: true, force: true });
});

describe('restoring a backup', () => {
  it('keeps no copy of the setup it replaced', async () => {
    const res = await POST(restoreRequest({
      _type: 'home-screens-backup',
      _version: 2,
      config: config('From the file'),
      chores: { chores: [] },
    }));

    expect(res.status).toBe(200);
    expect((await res.json()).restored.config).toBe(true);
    expect(await backupFiles()).toEqual([]);
  });

  it('is confirmed with a sentence that does not offer an undo', () => {
    const message = flatten(loadDict('en-US', 'editor')!)[
      'settings.dataPage.restoreConfirm.message'
    ] as string;

    // No promise of a copy to go back to, because none is made.
    expect(message).not.toMatch(/snapshot/i);
    expect(message.toLowerCase()).not.toContain('can be undone');
    expect(message.toLowerCase()).not.toContain('kept first');
    expect(message.toLowerCase()).not.toContain('saved first');
    // And it says so plainly instead.
    expect(message).toMatch(/cannot be undone/i);
  });
});

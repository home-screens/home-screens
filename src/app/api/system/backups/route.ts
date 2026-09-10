import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { withDataTransaction } from '@/lib/data-transaction';
import { saveImportedConfig } from '@/lib/family-import';
import { validateDisplays, validateAllSchedules } from '@/lib/display-filter';
import type { ScreenConfiguration } from '@/types/config';

export const dynamic = 'force-dynamic';

const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'upgrade.sh');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
// Rotating snapshots carry the version they were taken on, which on a
// prerelease build has its own dash-separated suffix (1.12.3-dev.20260908).
// The pinned copy from before the first prerelease install has a fixed name.
const BACKUP_NAME_RE = /^(config-v\d+\.\d+\.\d+(-[A-Za-z0-9.]+)?-\d{8}-\d{6}\.json|last-stable-config\.json)$/;

function run(action: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'bash',
      [SCRIPT_PATH, action, ...args],
      { cwd: process.cwd(), timeout: 10000 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      },
    );
  });
}

export const GET = withAuth(async (request: NextRequest) => {
  const download = request.nextUrl.searchParams.get('download');

  if (download) {
    if (!BACKUP_NAME_RE.test(download)) {
      return NextResponse.json({ error: 'Invalid backup filename' }, { status: 400 });
    }
    try {
      const filePath = path.join(BACKUP_DIR, download);
      const content = await withDataTransaction(() => readFile(filePath));
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${download}"`,
        },
      });
    } catch {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }
  }

  const output = await run('list-backups');
  const backups = JSON.parse(output);
  return NextResponse.json({ backups });
}, 'Failed to list backups');

export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ name?: string }>(request);
  if (body instanceof NextResponse) return body;

  const name = body.name;
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Missing "name"' }, { status: 400 });
  }

  // Validate filename to prevent path traversal
  if (!BACKUP_NAME_RE.test(name)) {
    return NextResponse.json({ error: 'Invalid backup filename' }, { status: 400 });
  }

  return withDataTransaction(async () => {
    let content: Buffer;
    try {
      content = await readFile(path.join(BACKUP_DIR, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      }
      throw error;
    }
    let config: unknown;
    try { config = JSON.parse(content.toString('utf8')); }
    catch { return NextResponse.json({ error: 'Backup file is not valid JSON' }, { status: 400 }); }
    const validationError = validateSnapshot(config);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    // The snapshot may predate family identities and shared lists. Plan and
    // publish that fold together with config; never shell out to a raw cp.
    // Do not read/migrate the replaced live config first: restoring a valid
    // snapshot must remain a way to repair a corrupt current config.
    await saveImportedConfig(config as ScreenConfiguration);
    return NextResponse.json({ ok: true, restored: name });
  });
}, 'Restore failed');

function validateSnapshot(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Invalid config: must be an object';
  const config = value as ScreenConfiguration;
  if (!Array.isArray(config.screens) || !config.settings || typeof config.settings !== 'object' || Array.isArray(config.settings)) {
    return 'Invalid config: must include screens array and settings';
  }
  // Existing config validators expect nested records; malformed snapshots
  // must be refused before planning, rather than becoming a partial restore.
  try {
    return validateDisplays(config) || validateAllSchedules(config);
  } catch {
    return 'Invalid config: malformed screens, displays or schedules';
  }
}

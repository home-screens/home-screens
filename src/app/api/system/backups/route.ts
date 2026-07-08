import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import { withAuth, parseJsonBody } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'upgrade.sh');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
const BACKUP_NAME_RE = /^config-v[\d.]+-\d{8}-\d{6}\.json$/;

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
      const content = await readFile(filePath);
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

  const output = await run('restore-backup', [name]);
  const result = JSON.parse(output);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}, 'Restore failed');

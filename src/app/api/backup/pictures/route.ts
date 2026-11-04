import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { readConfig } from '@/lib/config';
import { walkLibrary } from '@/lib/library-files';
import { pictureBackupSummary } from '@/lib/backup-pictures';

export const dynamic = 'force-dynamic';

/**
 * Counts and sizes for the Pictures choice under Save a copy: how many files
 * the screens use and how many the whole library holds, and how many
 * references already point at nothing. Only `?summary=1` is answered; the
 * pictures themselves travel inside the archive `POST /api/backup/archive`
 * streams, never as a listing here.
 */
export const GET = withAuth(async (request: NextRequest) => {
  if (request.nextUrl.searchParams.get('summary') !== '1') {
    return NextResponse.json({ error: 'Ask for ?summary=1' }, { status: 400 });
  }
  const [config, library] = await Promise.all([readConfig(), walkLibrary()]);
  return NextResponse.json(pictureBackupSummary(config, library));
}, 'Failed to count pictures');

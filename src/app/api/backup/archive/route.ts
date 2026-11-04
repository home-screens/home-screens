import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Readable } from 'stream';
import { parseJsonBody, withAuth } from '@/lib/api-utils';
import { readConfig } from '@/lib/config';
import { walkLibrary } from '@/lib/library-files';
import { composeBackupArchive } from '@/lib/backup-archive';
import { MAX_RESTORE_BYTES } from '@/lib/backup-limits';
import { parsePictureBackupChoice, pictureBackupSet } from '@/lib/backup-pictures';

export const dynamic = 'force-dynamic';

interface ArchiveRequest {
  /** The bundle exactly as the JSON backup would be written, icons and keys included. */
  bundle?: unknown;
  pictures?: unknown;
}

/**
 * A backup with pictures, as a zip. The client assembles the bundle the way
 * it does for a plain backup (`GET /api/backup`, then the icons and the keys
 * it chose) and posts it here with the Pictures choice; the answer streams
 * `backup.json` and then every chosen library file straight from disk, so
 * a gigabyte library never sits in memory. The pictures are chosen against
 * the bundle's own config, so they match the screens being saved rather than
 * one edited a second later.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<ArchiveRequest>(request, { maxBytes: MAX_RESTORE_BYTES });
  if (body instanceof NextResponse) return body;
  const bundle = body.bundle;
  if (!bundle || typeof bundle !== 'object' || (bundle as { _type?: unknown })._type !== 'home-screens-backup') {
    return NextResponse.json({ error: 'A backup bundle is needed' }, { status: 400 });
  }
  const choice = parsePictureBackupChoice(body.pictures);
  if (!choice || choice === 'off') {
    return NextResponse.json({ error: 'Choose which pictures to include' }, { status: 400 });
  }
  const config = (bundle as { config?: unknown }).config ?? await readConfig();
  const { items } = await walkLibrary();
  const pictures = pictureBackupSet(choice, config, items);
  // Nothing to add (an empty library, or screens that use none of it): the
  // plain JSON file is the better backup, and the client saves that instead.
  if (pictures.length === 0) return new NextResponse(null, { status: 204 });
  const stream = composeBackupArchive(bundle, pictures);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="home-screens-backup.zip"',
      'Cache-Control': 'no-store',
    },
  });
}, 'Failed to build the backup');

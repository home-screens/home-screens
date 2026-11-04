import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { withAuth } from '@/lib/api-utils';
import { volumeSpace } from '@/lib/library-files';
import {
  ArchiveTooLargeError,
  inspectRestoreArchive,
  stageRestoreArchive,
  stagedArchivePath,
  sweepStagedArchives,
} from '@/lib/backup-archive';
import { MAX_RESTORE_BYTES } from '@/lib/backup-limits';
import { RESTORE_FREE_SPACE_MARGIN } from '@/lib/backup-pictures';
import { isEncryptedEnvelope } from '@/lib/backup-credentials-types';
import { collectCustomIconIds } from '@/lib/custom-icons';

export const dynamic = 'force-dynamic';

/**
 * Stage a zip backup for `POST /api/backup`. The whole archive lands on the
 * hub in this one request; the answer tells the editor or the phone what
 * the backup holds, so they can run the same prompts they run for a JSON
 * backup (the password, the missing icons, the plaintext keys) without
 * downloading the bundle, and then post a tiny `{ _archive: id }` body. A
 * wrong password costs a re-post, never a re-upload.
 */
export const POST = withAuth(async (request: NextRequest) => {
  await sweepStagedArchives();
  // The archive needs room on the volume the library sits on, plus a margin
  // for the pictures to be copied out of it.
  const { freeBytes } = await volumeSpace();
  const cap = freeBytes === undefined ? Number.MAX_SAFE_INTEGER : Math.max(0, freeBytes - RESTORE_FREE_SPACE_MARGIN);
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > cap) return tooLarge();

  let id: string;
  try {
    id = await stageRestoreArchive(request.body, cap);
  } catch (err) {
    if (err instanceof ArchiveTooLargeError) return tooLarge();
    throw err;
  }
  const file = stagedArchivePath(id)!;
  const inspected = await inspectRestoreArchive(file, MAX_RESTORE_BYTES);
  let bundle: Record<string, unknown> | null = null;
  if (inspected) {
    try {
      const parsed: unknown = JSON.parse(inspected.bundleText);
      if (parsed && typeof parsed === 'object' && (parsed as { _type?: unknown })._type === 'home-screens-backup') {
        bundle = parsed as Record<string, unknown>;
      }
    } catch { /* answered below */ }
  }
  if (!inspected || !bundle) {
    await fs.rm(file, { force: true }).catch(() => {});
    return NextResponse.json({ error: 'That file is not a Home Screens backup.' }, { status: 400 });
  }
  return NextResponse.json({
    id,
    hasCredentials: bundle.credentials !== undefined,
    credentialsEncrypted: bundle.credentials !== undefined && isEncryptedEnvelope(bundle.credentials),
    hasCustomIcons: bundle.customIcons !== undefined,
    usesCustomIcons: collectCustomIconIds(bundle).size > 0,
    pictures: {
      count: inspected.pictures.length,
      bytes: inspected.pictures.reduce((sum, picture) => sum + picture.bytes, 0),
      skipped: inspected.skipped,
    },
  });
}, 'Failed to read the backup');

function tooLarge(): NextResponse {
  return NextResponse.json({ error: 'Not enough space on the hub for this backup.' }, { status: 413 });
}

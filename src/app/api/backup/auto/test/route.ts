import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { readAutoBackupSecrets } from '@/lib/auto-backup-secrets';
import { destinationFromBody, isDestinationRefusal } from '@/lib/auto-backup-destination';
import { checkDestination } from '@/lib/offsite-send';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = logger('auto-backup');

/**
 * "Check it works": save a small file in the storage folder and remove it
 * again. Tests the kind, address, name and password in the body when there
 * is one (the form before it is saved), otherwise the saved folder. The
 * answer is a result either way: `{ ok: true }` or `{ ok: false, code }`,
 * and for a network share whose name is wrong, `shares` lists the ones the
 * storage has.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ kind?: unknown; url?: unknown; address?: unknown; username?: unknown; password?: unknown }>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const { destination: saved } = await readAutoBackupSecrets();
  let dest = saved;
  if (body.kind !== undefined) {
    const parsed = destinationFromBody(body, saved);
    if (isDestinationRefusal(parsed)) return NextResponse.json(parsed, { status: 400 });
    dest = parsed;
  }
  if (!dest) return NextResponse.json({ error: 'No storage folder is set up.', code: 'not_set_up' }, { status: 400 });
  const outcome = await checkDestination(dest);
  if (outcome.ok) return NextResponse.json({ ok: true });
  // The page shows one plain sentence; the raw reason goes to the log, so it
  // reaches the diagnostics bundle when the sentence is not enough.
  const where = dest.kind === 'smb' ? `${dest.host}${dest.port ? `:${dest.port}` : ''}` : new URL(dest.url).host;
  log.warn(`Storage folder check failed (${dest.kind} ${where}, ${outcome.code}): ${outcome.detail ?? ''}`);
  return NextResponse.json({ ok: false, code: outcome.code, ...(outcome.shares ? { shares: outcome.shares } : {}) });
}, 'Failed to check the storage folder');

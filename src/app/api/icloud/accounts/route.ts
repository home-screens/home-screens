import { NextResponse } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import {
  listICloudAccountInfo,
  addICloudAccount,
  removeICloudAccount,
} from '@/lib/icloud-accounts';
import { listICloudCalendars } from '@/lib/caldav-calendar';
import { logger } from '@/lib/logger';

const log = logger('icloud-accounts');

export const dynamic = 'force-dynamic';

// Credentials are short strings; matches the bound used by /api/secrets.
const MAX_BODY_BYTES = 64 * 1024;

export const GET = withAuth(async () => {
  const accounts = await listICloudAccountInfo();
  return NextResponse.json(accounts);
}, 'Failed to list iCloud accounts');

export const POST = withAuth(async (request) => {
  const body = await parseJsonBody<{ appleId?: string; appPassword?: string }>(request, {
    maxBytes: MAX_BODY_BYTES,
  });
  if (body instanceof NextResponse) return body;

  const appleId = body.appleId?.trim();
  const appPassword = body.appPassword?.trim();
  if (!appleId || !appPassword) {
    return NextResponse.json(
      { error: 'Missing required fields: appleId, appPassword' },
      { status: 400 },
    );
  }

  // Prove the credentials work before saving them (Todoist-style validation).
  // Rejection is a 400, not 401 — editorFetch treats any 401 as an expired
  // editor session and redirects to /login, which would eat this message.
  try {
    await listICloudCalendars({ id: 'pending', appleId, appPassword });
  } catch (err) {
    log.warn(`iCloud sign-in check failed for ${appleId}`, err);
    return NextResponse.json(
      {
        error:
          "Couldn't sign in to iCloud. Double-check the Apple ID, and make sure the password is an app password created at account.apple.com; your regular Apple password won't work here.",
      },
      { status: 400 },
    );
  }

  const account = await addICloudAccount(appleId, appPassword);
  return NextResponse.json(account);
}, 'Failed to add iCloud account');

export const DELETE = withAuth(async (request) => {
  const body = await parseJsonBody<{ id?: string }>(request, {
    maxBytes: MAX_BODY_BYTES,
  });
  if (body instanceof NextResponse) return body;

  if (!body.id) {
    return NextResponse.json(
      { error: 'Missing required field: id' },
      { status: 400 },
    );
  }

  await removeICloudAccount(body.id);
  return NextResponse.json({ ok: true });
}, 'Failed to remove iCloud account');

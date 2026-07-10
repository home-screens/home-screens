import { NextResponse } from 'next/server';
import { getSecretStatus, setSecret, deleteSecret, isValidSecretKey } from '@/lib/secrets';
import { withAuth, validateTodoistToken, parseJsonBody } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// Secrets are short strings (API keys, tokens); 64 KB is far beyond any
// legitimate payload while keeping the route consistent with the bounded
// parsing used by other write endpoints (e.g. /api/backup).
const MAX_BODY_BYTES = 64 * 1024;

export const GET = withAuth(async () => {
  const status = await getSecretStatus();
  return NextResponse.json(status);
}, 'Failed to read secret status');

export const PUT = withAuth(async (request) => {
  const body = await parseJsonBody<{ key?: string; value?: string }>(request, {
    maxBytes: MAX_BODY_BYTES,
  });
  if (body instanceof NextResponse) return body;
  const { key, value } = body;

  if (!key || typeof value !== 'string' || !value.trim()) {
    return NextResponse.json(
      { error: 'Missing required fields: key, value' },
      { status: 400 },
    );
  }

  if (!isValidSecretKey(key)) {
    return NextResponse.json(
      { error: `Invalid secret key: ${key}` },
      { status: 400 },
    );
  }

  // Validate Todoist token before saving. Rejection is a 400, not 401 —
  // editorFetch treats any 401 as an expired editor session and redirects
  // to /login, which would swallow the message before SecretField shows it.
  if (key === 'todoist_token') {
    const result = await validateTodoistToken(value);
    if (!result.valid) {
      return NextResponse.json(
        { error: 'Invalid Todoist token; Todoist returned ' + result.status },
        { status: 400 },
      );
    }
  }

  await setSecret(key, value);
  return NextResponse.json({ ok: true });
}, 'Failed to save secret');

export const DELETE = withAuth(async (request) => {
  const body = await parseJsonBody<{ key?: string }>(request, {
    maxBytes: MAX_BODY_BYTES,
  });
  if (body instanceof NextResponse) return body;
  const { key } = body;

  if (!key) {
    return NextResponse.json(
      { error: 'Missing required field: key' },
      { status: 400 },
    );
  }

  if (!isValidSecretKey(key)) {
    return NextResponse.json(
      { error: `Invalid secret key: ${key}` },
      { status: 400 },
    );
  }

  await deleteSecret(key);
  return NextResponse.json({ ok: true });
}, 'Failed to delete secret');

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getPickerAuthUrl, exchangePickerCode } from '@/lib/google-picker';
import { withAuth, parseJsonBody } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/** GET — the Google sign-in URL the editor opens in a new tab. */
export const GET = withAuth(async () => {
  try {
    const url = await getPickerAuthUrl();
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build sign-in link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, 'Failed to build sign-in link');

/** POST — exchange the pasted code (or full redirect URL). Body: { code } */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ code?: string }>(request);
  if (body instanceof NextResponse) return body;
  if (!body.code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }
  const result = await exchangePickerCode(body.code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ connected: true });
}, 'Sign-in failed');

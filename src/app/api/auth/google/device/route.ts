import { NextRequest, NextResponse } from 'next/server';
import { requestDeviceCode, pollDeviceToken } from '@/lib/google-auth';
import { requireSession } from '@/lib/auth';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/** POST — start device flow, returns user_code + verification_url */
export async function POST(request: NextRequest) {
  try {
    await requireSession(request);
    const data = await requestDeviceCode();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Response) return error;
    // Surface the actual error so the user knows what to fix.
    // Include masked client ID so they can verify the right one is configured.
    const message = error instanceof Error ? error.message : 'Failed to start device flow';
    let clientIdHint: string | undefined;
    try {
      const { getSecret } = await import('@/lib/secrets');
      const id = await getSecret('google_client_id');
      if (id) clientIdHint = id.length > 32 ? id.slice(0, 8) + '…' + id.slice(-24) : id;
    } catch { /* ignore */ }
    return NextResponse.json({ error: message, clientIdHint }, { status: 500 });
  }
}

/** PUT — poll for token completion. Body: { device_code } */
export const PUT = withAuth(async (request: NextRequest) => {
  const { device_code } = await request.json();
  if (!device_code) {
    return NextResponse.json({ error: 'Missing device_code' }, { status: 400 });
  }
  const result = await pollDeviceToken(device_code);
  return NextResponse.json(result);
}, 'Poll failed');

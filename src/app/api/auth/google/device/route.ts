import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requestDeviceCode, pollDeviceToken } from '@/lib/google-auth';
import { withAuth, parseJsonBody, errorResponse } from '@/lib/api-utils';
import { getSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

/**
 * A masked copy of the saved Client ID, so a failed start lets the person
 * check that the right one is configured without the page showing the whole id.
 */
async function clientIdHint(): Promise<string | undefined> {
  try {
    const id = await getSecret('google_client_id');
    if (!id) return undefined;
    return id.length > 32 ? id.slice(0, 8) + '…' + id.slice(-24) : id;
  } catch {
    return undefined;
  }
}

/**
 * POST — start device flow, returns user_code + verification_url. A failure
 * answers the way every route does (a missing client as a setup answer, a
 * refusal from Google as a 500 with Google's words in `detail`) plus
 * `clientIdHint`.
 */
export const POST = withAuth(async () => {
  try {
    return NextResponse.json(await requestDeviceCode());
  } catch (error) {
    const response = errorResponse(error, 'Failed to start device flow');
    const hint = await clientIdHint();
    if (!hint) return response;
    return NextResponse.json({ ...(await response.json()), clientIdHint: hint }, { status: response.status });
  }
}, 'Failed to start device flow');

/** PUT — poll for token completion. Body: { device_code } */
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ device_code?: string }>(request);
  if (body instanceof NextResponse) return body;
  const { device_code } = body;
  if (!device_code) {
    return NextResponse.json({ error: 'Missing device_code' }, { status: 400 });
  }
  const result = await pollDeviceToken(device_code);
  return NextResponse.json(result);
}, 'Poll failed');

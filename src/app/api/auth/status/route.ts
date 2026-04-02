import { NextRequest, NextResponse } from 'next/server';
import { isAuthEnabled, readAuthState, verifySession, getDisplayToken } from '@/lib/auth';
import { errorResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authEnabled = await isAuthEnabled();

    let authenticated = false;
    if (authEnabled) {
      const cookieHeader = request.headers.get('cookie') ?? '';
      const match = cookieHeader.match(/(?:^|;\s*)hs-session=([^;]+)/);
      const token = match?.[1];
      if (token) {
        const state = await readAuthState();
        if (state.cookieSecret) {
          authenticated = verifySession(token, state.cookieSecret, state.sessionEpoch) !== null;
        }
      }
    }

    const hasDisplayToken = authEnabled ? !!(await getDisplayToken()) : false;
    return NextResponse.json({ authEnabled, authenticated, hasDisplayToken });
  } catch (error) {
    return errorResponse(error, 'Failed to check auth status');
  }
}

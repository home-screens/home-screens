import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAuthEnabled, readAuthState, verifySession, getDisplayToken, getIpAllowlistConfig } from '@/lib/auth';
import { errorResponse, getClientIP } from '@/lib/api-utils';
import { isIpAllowed } from '@/lib/ip-allowlist';

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

    // Check if caller is restricted by IP allowlist
    let ipRestricted = false;
    const ipConfig = await getIpAllowlistConfig();
    if (ipConfig.restrictAccess && ipConfig.allowlist.length > 0) {
      const callerIp = getClientIP(request);
      ipRestricted = !isIpAllowed(callerIp, ipConfig.allowlist);
    }

    return NextResponse.json({ authEnabled, authenticated, hasDisplayToken, ipRestricted });
  } catch (error) {
    return errorResponse(error, 'Failed to check auth status');
  }
}

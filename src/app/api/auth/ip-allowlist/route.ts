import { NextRequest, NextResponse } from 'next/server';
import { withAuth, getClientIP, parseJsonBody } from '@/lib/api-utils';
import { getIpAllowlistConfig, isAuthEnabled, setIpAllowlistConfig } from '@/lib/auth';
import { isIpAllowed, normalizeIp } from '@/lib/ip-allowlist';
import { readWalls } from '@/lib/display-walls';
import { HUB_SCREEN_ADDRESS, hasHubScreen, leavesOutHubScreen } from '@/lib/hub-screen-allowlist';
import { cidrFault, type CidrFault } from '@/lib/cidr';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** For the log and for API callers; the editor words the refusal itself from `code` and `entry`. */
const FAULT_WORDS: Record<CidrFault, string> = {
  format: 'Invalid CIDR format',
  address: 'Invalid IP address',
  prefix: 'Prefix length must be 0-32',
};

/** Whether a wall opens from the hub itself, the screen plugged into it. */
async function hubHasScreen(): Promise<boolean> {
  return hasHubScreen((await readWalls(await isAuthEnabled())).walls);
}

export const GET = withAuth(async (request: NextRequest) => {
  const config = await getIpAllowlistConfig();
  // Normalize before returning so the UI shows what the matcher actually uses
  // (e.g. ::ffff:127.0.0.1 → 127.0.0.1). Otherwise users see the mapped form
  // and mistakenly think the IPv6 warning applies to them.
  const callerIp = normalizeIp(getClientIP(request));
  return NextResponse.json({
    allowlist: config.allowlist,
    bypassAuth: config.bypassAuth,
    restrictAccess: config.restrictAccess,
    callerIp,
    // A list saved before the save asked about it can already be blanking
    // the hub's own screen; the Security page says so.
    hubScreenLeftOut: leavesOutHubScreen(config, await hubHasScreen()),
    hubScreenAddress: HUB_SCREEN_ADDRESS,
  });
}, 'Failed to read IP allowlist');

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{
    allowlist?: unknown;
    bypassAuth?: unknown;
    restrictAccess?: unknown;
    force?: unknown;
    forceHubScreen?: unknown;
  }>(request);
  if (body instanceof NextResponse) return body;
  const { allowlist, bypassAuth, restrictAccess, force, forceHubScreen } = body;

  // Validate types
  if (!Array.isArray(allowlist) || typeof bypassAuth !== 'boolean' || typeof restrictAccess !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Validate every CIDR entry
  for (const entry of allowlist) {
    if (typeof entry !== 'string') {
      return NextResponse.json({ error: 'Allowlist entries must be strings' }, { status: 400 });
    }
    const fault = cidrFault(entry);
    if (fault) {
      return NextResponse.json({ error: `Invalid entry "${entry}": ${FAULT_WORDS[fault]}`, code: 'allowlist.badEntry', params: { entry }, entry }, { status: 400 });
    }
  }

  // Lockout pre-check: if the caller would lock themselves out by enabling
  // restriction with an allowlist that excludes their IP, return 409 without
  // saving. The UI can re-submit with `force: true` after the user confirms.
  // Normalize caller IP so the UI dialog shows the same form as the matcher uses.
  const callerIp = normalizeIp(getClientIP(request));
  if (restrictAccess && allowlist.length > 0 && !isIpAllowed(callerIp, allowlist) && force !== true) {
    return NextResponse.json(
      {
        error: 'Lockout warning',
        reason: 'your_ip_not_in_allowlist',
        callerIp,
      },
      { status: 409 },
    );
  }

  // The same for the screen plugged into the hub, which opens the wall from
  // 127.0.0.1. It is never let through on its own (a reverse proxy on the
  // same box makes every visitor 127.0.0.1), so the editor offers to add it.
  if (forceHubScreen !== true && leavesOutHubScreen({ allowlist, restrictAccess }, await hubHasScreen())) {
    return NextResponse.json(
      {
        error: 'This list turns away the screen plugged into the hub',
        reason: 'hub_screen_not_in_allowlist',
        hubScreenAddress: HUB_SCREEN_ADDRESS,
      },
      { status: 409 },
    );
  }

  // Save
  await setIpAllowlistConfig({ allowlist, bypassAuth, restrictAccess });

  // Audit
  audit({ action: 'ip_allowlist_change', ip: callerIp, entryCount: allowlist.length });

  return NextResponse.json({ saved: true });
}, 'Failed to update IP allowlist');

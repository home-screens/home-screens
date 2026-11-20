import { NextRequest, NextResponse } from 'next/server';
import { withAuth, getClientIP, parseJsonBody } from '@/lib/api-utils';
import { getIpAllowlistConfig, setIpAllowlistConfig } from '@/lib/auth';
import { isIpAllowed, normalizeIp } from '@/lib/ip-allowlist';
import { cidrFault, type CidrFault } from '@/lib/cidr';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** For the log and for API callers; the editor words the refusal itself from `code` and `entry`. */
const FAULT_WORDS: Record<CidrFault, string> = {
  format: 'Invalid CIDR format',
  address: 'Invalid IP address',
  prefix: 'Prefix length must be 0-32',
};

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
  });
}, 'Failed to read IP allowlist');

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{
    allowlist?: unknown;
    bypassAuth?: unknown;
    restrictAccess?: unknown;
    force?: unknown;
  }>(request);
  if (body instanceof NextResponse) return body;
  const { allowlist, bypassAuth, restrictAccess, force } = body;

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
      return NextResponse.json({ error: `Invalid entry "${entry}": ${FAULT_WORDS[fault]}`, code: 'invalid_address', entry }, { status: 400 });
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

  // Save
  await setIpAllowlistConfig({ allowlist, bypassAuth, restrictAccess });

  // Audit
  audit({ action: 'ip_allowlist_change', ip: callerIp, entryCount: allowlist.length });

  return NextResponse.json({ saved: true });
}, 'Failed to update IP allowlist');

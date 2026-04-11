import { NextRequest, NextResponse } from 'next/server';
import { withAuth, getClientIP } from '@/lib/api-utils';
import { getIpAllowlistConfig, setIpAllowlistConfig } from '@/lib/auth';
import { validateCidr, isIpAllowed } from '@/lib/ip-allowlist';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest) => {
  const config = await getIpAllowlistConfig();
  const callerIp = getClientIP(request);
  return NextResponse.json({
    allowlist: config.allowlist,
    bypassAuth: config.bypassAuth,
    restrictAccess: config.restrictAccess,
    callerIp,
  });
}, 'Failed to read IP allowlist');

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { allowlist, bypassAuth, restrictAccess } = body;

  // Validate types
  if (!Array.isArray(allowlist) || typeof bypassAuth !== 'boolean' || typeof restrictAccess !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Validate every CIDR entry
  for (const entry of allowlist) {
    if (typeof entry !== 'string') {
      return NextResponse.json({ error: 'Allowlist entries must be strings' }, { status: 400 });
    }
    const err = validateCidr(entry);
    if (err) {
      return NextResponse.json({ error: `Invalid entry "${entry}": ${err}` }, { status: 400 });
    }
  }

  // Save
  await setIpAllowlistConfig({ allowlist, bypassAuth, restrictAccess });

  // Audit
  const callerIp = getClientIP(request);
  audit({ action: 'ip_allowlist_change', ip: callerIp, entryCount: allowlist.length });

  // Lockout warning
  let warning: string | undefined;
  if (restrictAccess && allowlist.length > 0 && !isIpAllowed(callerIp, allowlist)) {
    warning = 'your_ip_not_in_allowlist';
  }

  return NextResponse.json({ saved: true, ...(warning && { warning }) });
}, 'Failed to update IP allowlist');

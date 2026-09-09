import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getVersionInfo, getVersionTags, type VersionResponse } from '@/lib/version';
import { parseUpdateChannel } from '@/lib/semver';
import { isUpgradeRunning } from '@/lib/upgrade';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest) => {
  const forceCheck = request.nextUrl.searchParams.get('check') === 'true';
  const channel = parseUpdateChannel(request.nextUrl.searchParams.get('channel'));

  const [info, tags] = await Promise.all([
    getVersionInfo({ force: forceCheck, channel }),
    getVersionTags({ force: forceCheck, channel }),
  ]);

  const payload: VersionResponse = {
    ...info,
    tags: tags.slice(0, 20), // Last 20 versions
    upgradeRunning: isUpgradeRunning(),
  };
  return NextResponse.json(payload);
}, 'Failed to get version info');

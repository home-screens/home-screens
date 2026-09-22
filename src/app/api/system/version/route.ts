import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getVersionInfo, getVersionTags, type VersionResponse } from '@/lib/version';
import { parseUpdateChannel } from '@/lib/semver';
import { isUpgradeRunning } from '@/lib/upgrade';
import { readConfig } from '@/lib/config';
import { readFailedUpdate } from '@/lib/upgrade-failed-state';
import { readAutoUpdateState } from '@/lib/auto-update-state';
import { resolveAutoUpdateSettings, type AutoUpdateState } from '@/lib/auto-update-policy';
import { describeAutoUpdateSchedule } from '@/lib/auto-update-scheduler';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/** The raw error is for the diagnostics bundle; the page words each outcome itself. */
function withoutError(state: AutoUpdateState | null): Omit<AutoUpdateState, 'error'> | null {
  if (!state) return null;
  const { error: _error, ...rest } = state;
  return rest;
}

export const GET = withAuth(async (request: NextRequest) => {
  const forceCheck = request.nextUrl.searchParams.get('check') === 'true';
  const channel = parseUpdateChannel(request.nextUrl.searchParams.get('channel'));

  // The schema stamped on the saved config decides whether a step back may
  // be offered (see update-policy.ts). Unreadable means unknown, never blocked.
  const config = await readConfig().catch(() => null);
  const localSchema = config?.version ?? null;
  const [info, tags, lastFailedUpdate, autoUpdateState] = await Promise.all([
    getVersionInfo({ force: forceCheck, channel, localSchema }),
    getVersionTags({ force: forceCheck, channel }),
    readFailedUpdate(),
    readAutoUpdateState(),
  ]);

  const autoSettings = resolveAutoUpdateSettings(config?.settings?.autoUpdate);
  const payload: VersionResponse = {
    ...info,
    tags: tags.slice(0, 20), // Last 20 versions
    upgradeRunning: isUpgradeRunning(),
    lastFailedUpdate,
    localSchema,
    autoUpdate: {
      enabled: autoSettings.enabled,
      lastRun: withoutError(autoUpdateState),
      ...describeAutoUpdateSchedule(autoSettings, config?.settings?.timezone, autoUpdateState?.runDate ?? null),
    },
  };
  return NextResponse.json(payload);
}, 'Failed to get version info');

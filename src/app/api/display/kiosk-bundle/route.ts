/**
 * GET /api/display/kiosk-bundle — serve a display-only Pi its shell layer.
 *
 * A spoke renders the hub's web app, so the app updates itself for free. Its
 * local shell layer (kiosk launcher, splash page, reporter, systemd units)
 * used to fossilize the day the Pi was flashed, and the only way to move it
 * forward was manual SSH. This endpoint is the other half of the fix: the
 * spoke's `kiosk-update.sh` polls it and brings itself to the hub's version.
 *
 * Two responses:
 *   ?manifest=1 → JSON { version, sha256, restartAdvised, files[] }
 *   otherwise   → application/gzip tarball
 *
 * Auth: the same adoption gate as /api/display/hw-stats. An unadopted spoke
 * gets a 403, which its updater treats as "no update" and rides out silently,
 * exactly like the reporter does. This adds no new trust relationship —
 * spokes already execute the hub's JavaScript unsandboxed.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isValidDisplayId } from '@/lib/display-filter';
import { requireAdoptedDisplay } from '@/lib/adopted-display-gate';
import { getKioskBundle } from '@/lib/kiosk-bundle';
import { getDisplayStatus } from '@/lib/display-commands';
import { computeRestartAdvised, resolveDisplayRestartInputs } from '@/lib/kiosk-restart-advice';
import { getPackageVersion } from '@/lib/version';
import { readConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const displayId = request.nextUrl.searchParams.get('display');
  if (!displayId || !isValidDisplayId(displayId)) {
    return NextResponse.json({ error: 'Invalid or missing display' }, { status: 400 });
  }

  const authErr = await requireAdoptedDisplay(displayId);
  if (authErr) return authErr;

  let bundle;
  try {
    bundle = await getKioskBundle({
      rootDir: process.cwd(),
      version: await getPackageVersion(),
    });
  } catch (err) {
    // A hub whose tree is missing a spoke script can't hand out a bundle.
    // 503 (not 500) so the spoke reads it as "try again later" and keeps
    // running what it has.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bundle unavailable' },
      { status: 503 },
    );
  }

  if (request.nextUrl.searchParams.get('manifest') === '1') {
    const config = await readConfig();
    const { hasSleepSchedule, timezone } = resolveDisplayRestartInputs(config, displayId);
    const restartAdvised = computeRestartAdvised({
      displayState: getDisplayStatus(displayId)?.displayState ?? null,
      hasSleepSchedule,
      timezone,
      now: new Date(),
    });

    return NextResponse.json(
      {
        version: bundle.version,
        sha256: bundle.sha256,
        restartAdvised,
        files: bundle.files,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return new NextResponse(new Uint8Array(bundle.tarGz), {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Length': String(bundle.tarGz.length),
      'Content-Disposition': `attachment; filename="home-screens-kiosk-${bundle.version}.tar.gz"`,
      'Cache-Control': 'no-store',
    },
  });
}

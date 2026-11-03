/**
 * POST /api/display/hw-stats — accept a hardware-stats snapshot from a
 * display-only Pi's bash reporter.
 *
 * Trust model: adoption IS authorization. The endpoint is not wrapped in
 * `withDisplayAuth` because the reporter runs on a different Pi and cannot
 * reasonably carry a display bearer token. Instead, the displayId must
 * appear in `config.displays` (or be the literal `main` in legacy single-
 * display mode). The LAN is the trust boundary, same as the implicit
 * posture the display-page SSR already relies on.
 *
 * Body shape: { displayId: string, hwStats: HardwareStats }
 *
 *   - displayId is validated against the adopted-display registry.
 *   - hwStats is validated against the shared schema in hardware-stats.ts.
 *
 * Browser heartbeats (/api/display/status) continue to use `withDisplayAuth`;
 * they carry rotator state (currentScreen, activeProfile, etc.) that isn't
 * safe to accept from an unauthenticated caller.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody } from '@/lib/api-utils';
import { setDisplayStatus } from '@/lib/display-commands';
import { isValidDisplayId } from '@/lib/display-filter';
import { requireAdoptedDisplay } from '@/lib/adopted-display-gate';
import { validateHardwareStats } from '@/lib/hardware-stats';

export const dynamic = 'force-dynamic';

/** A report with the whole kiosk package list is a few KB; this leaves room for a long one. */
const HW_STATS_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // A report is a few dozen numbers and the kiosk package list; anything
  // larger is not the reporter, and it is refused before it is parsed.
  const body = await parseJsonBody<{ displayId?: unknown; hwStats?: unknown } | null>(request, { maxBytes: HW_STATS_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const displayId = body.displayId;
  if (typeof displayId !== 'string' || !isValidDisplayId(displayId)) {
    return NextResponse.json({ error: 'Invalid displayId' }, { status: 400 });
  }

  const authErr = await requireAdoptedDisplay(displayId);
  if (authErr) return authErr;

  const hwStats = validateHardwareStats(body.hwStats);
  if (!hwStats) {
    return NextResponse.json({ error: 'Invalid hwStats' }, { status: 400 });
  }

  // Stub DisplayStatus so the existing statusMap merge path accepts the
  // hwStats without clobbering real rotator state the browser client posts
  // (setDisplayStatus has an isStubHeartbeat guard that only updates
  // hwStats/browserStats/lastSeen in this case).
  setDisplayStatus(
    {
      currentScreen: { index: 0, id: '', name: '' },
      screenCount: 0,
      activeProfile: null,
      displayState: 'active',
      timestamp: Date.now(),
      hwStats,
    },
    displayId,
  );

  return NextResponse.json({ ok: true });
}

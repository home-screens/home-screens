/**
 * GET /api/display/power-state?display=<id>&applied=on|off
 *
 * Polled by `scripts/kiosk-power-agent.sh` from inside the kiosk session.
 * Answers `{ power: 'on' | 'off' }`: whether the panel should be powered
 * right now (see `src/lib/panel-power.ts` for the decision). `applied` is the
 * state the agent currently has set, recorded so the editor can show whether
 * power control is actually working on a display.
 *
 * Auth: the same adoption gate as /api/display/hw-stats. The agent is a bash
 * loop on a display-only Pi with no display bearer token; the LAN is the
 * trust boundary. Every failure (bad id, unadopted display, unreadable
 * config) is answered so the agent reads it as `on` — the agent's own
 * error-streak rule does the same, so a panel is never left dark on
 * ambiguity.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isValidDisplayId, MAIN_DISPLAY_ID } from '@/lib/display-filter';
import { requireAdoptedDisplay } from '@/lib/adopted-display-gate';
import { getDisplayStatus, recordPanelPowerAgent } from '@/lib/display-commands';
import { readConfigCached } from '@/lib/config-cache';
import { computePanelPower, resolvePanelPowerEnabled } from '@/lib/panel-power';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const displayId = request.nextUrl.searchParams.get('display');
  if (!displayId || !isValidDisplayId(displayId)) {
    return NextResponse.json({ error: 'Invalid or missing display' }, { status: 400 });
  }

  const authErr = await requireAdoptedDisplay(displayId);
  if (authErr) return authErr;

  let config;
  try {
    config = await readConfigCached();
  } catch {
    return NextResponse.json({ power: 'on' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Legacy single-display mode: the hub's own browser reports with no
  // displayId, so its status lives in the `__default__` slot, while the hub
  // Pi's agent (which has no DISPLAY_ID in kiosk.conf) asks as `main`.
  const legacy = !config.displays || config.displays.length === 0;
  const statusKey = legacy && displayId === MAIN_DISPLAY_ID ? undefined : displayId;

  const applied = request.nextUrl.searchParams.get('applied');
  if (applied === 'on' || applied === 'off') {
    recordPanelPowerAgent(statusKey, applied);
  }

  const status = getDisplayStatus(statusKey);
  const power = computePanelPower({
    enabled: resolvePanelPowerEnabled(config, displayId),
    displayState: status?.displayState,
    browserSeen: status?.browserSeen,
    now: Date.now(),
  });

  return NextResponse.json({ power }, { headers: { 'Cache-Control': 'no-store' } });
}

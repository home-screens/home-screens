/**
 * Works out, for one request, the facts `admitWithoutAsking` needs. Shared
 * by the wall's heartbeat and by `POST /api/display/claim`.
 */
import type { NextRequest } from 'next/server';
import { getAdoptedDisplayIds } from './adopted-display-cache';
import { carriesDisplayKey, getIpAllowlistConfig, isAuthEnabled } from './auth';
import { getClientIP } from './api-utils';
import { isWindowOpen, type AdmissionFacts } from './display-admission';
import { MAIN_DISPLAY_ID } from './display-filter';
import { SINGLE_DISPLAY_KEY, readWalls } from './display-walls';
import { isIpAllowed } from './ip-allowlist';
import { isHubOwnScreen } from './wall-request';

/**
 * Whether `displayId` names a display this hub has. A hub with one display
 * has no list: a wall that names none, or names `main`, is that display.
 */
export async function isDisplayAdopted(displayId: string | undefined): Promise<boolean> {
  const adopted = await getAdoptedDisplayIds();
  if (adopted) return adopted.includes(displayId ?? MAIN_DISPLAY_ID);
  return displayId === undefined || displayId === MAIN_DISPLAY_ID;
}

export async function admissionFacts(request: NextRequest, displayId: string | undefined): Promise<AdmissionFacts> {
  const passwordSet = await isAuthEnabled();
  if (!passwordSet) {
    return {
      passwordSet,
      holdsKey: false,
      hubOwnScreen: false,
      allowedNetwork: false,
      windowOpen: false,
      displayAdopted: false,
      windowAdmissions: 0,
    };
  }
  const [walls, allow, holdsKey, displayAdopted] = await Promise.all([
    readWalls(passwordSet),
    getIpAllowlistConfig(),
    carriesDisplayKey(request),
    isDisplayAdopted(displayId),
  ]);
  return {
    passwordSet,
    holdsKey,
    hubOwnScreen: isHubOwnScreen(request),
    allowedNetwork: allow.bypassAuth && allow.allowlist.length > 0 && isIpAllowed(getClientIP(request), allow.allowlist),
    windowOpen: isWindowOpen(walls.windowStartedAt, Date.now()),
    displayAdopted,
    windowAdmissions: walls.windowAdmissions[displayId ?? SINGLE_DISPLAY_KEY] ?? 0,
  };
}

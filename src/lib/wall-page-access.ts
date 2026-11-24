/**
 * Whether the browser asking for a `/display` page may be shown the wall.
 *
 * The page's HTML carries the display's whole layout and its module
 * settings, and `/display` is not behind the sign-in gate (a Pi in kiosk
 * mode cannot type a password). So on a hub with a password the page
 * checks for itself, before rendering anything: a wall that has been let
 * in, or someone signed in. Everyone else gets `WallGate`, which asks
 * `POST /api/display/claim` and never sees the layout.
 */
import { headers } from 'next/headers';
import { cookiesHoldSignIn, isAuthEnabled, wallFromCookies } from './auth';

export interface WallPageAccess {
  /** Render the wall. False means render the gate instead. */
  show: boolean;
  /**
   * Shown on a sign-in alone, with no wall cookie: a grown-up looking at
   * the wall in a browser. It stops when they sign out, unless they choose
   * to keep the browser as a wall.
   */
  onSignInOnly: boolean;
}

export async function wallPageAccess(): Promise<WallPageAccess> {
  if (!(await isAuthEnabled())) return { show: true, onSignInOnly: false };
  const cookieHeader = (await headers()).get('cookie') ?? '';
  const wall = await wallFromCookies(cookieHeader);
  if (wall?.status === 'in') return { show: true, onSignInOnly: false };
  if (await cookiesHoldSignIn(cookieHeader)) return { show: true, onSignInOnly: true };
  return { show: false, onSignInOnly: false };
}

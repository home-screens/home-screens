import { NextResponse } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { getPluginManifest } from '@/lib/plugin-utils';
import { getPluginAuthStatus } from '@/lib/plugin-auth';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ pluginId: string }> };

/**
 * Report whether a plugin's account is connected (and when its token expires).
 * Guarded by withDisplayAuth (session cookie OR display Bearer token) because
 * the kiosk SDK's `getAuthStatus` reads it from a display, which never carries
 * the admin session cookie — the editor also calls it and is covered by the
 * cookie branch. The response carries no secrets, only connect state + expiry.
 */
export const GET = withDisplayAuth<RouteContext>(async (_request, ctx) => {
  const { pluginId } = await ctx.params;
  const manifest = await getPluginManifest(pluginId);
  if (!manifest?.auth) {
    return NextResponse.json({ error: 'Plugin does not declare an auth adapter' }, { status: 404 });
  }
  const status = await getPluginAuthStatus(pluginId);
  return NextResponse.json(status);
}, 'Failed to read plugin authentication status');

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getPluginManifest } from '@/lib/plugin-utils';
import { audit } from '@/lib/audit';
import { disconnectPluginAuth } from '@/lib/plugin-auth';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ pluginId: string }> };

/** Revoke (best-effort) and clear a plugin's stored tokens + pending state. */
export const DELETE = withAuth<RouteContext>(async (_request, ctx) => {
  const { pluginId } = await ctx.params;
  const manifest = await getPluginManifest(pluginId);
  if (!manifest?.auth) {
    return NextResponse.json({ error: 'Plugin does not declare an auth adapter' }, { status: 404 });
  }
  await disconnectPluginAuth(pluginId);
  audit({ action: 'plugin_auth_revoke', pluginId });
  return NextResponse.json({ connected: false });
}, 'Failed to disconnect plugin authentication');

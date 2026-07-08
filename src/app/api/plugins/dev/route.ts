import { NextResponse } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { validateManifest, registerDevPlugin } from '@/lib/plugins';
import type { PluginManifest } from '@/types/plugins';

export const dynamic = 'force-dynamic';

/**
 * Register a dev plugin on the server so the proxy can find its manifest
 * and allowedDomains. Called automatically by loadDevPlugin on the client.
 * Requires session auth — this is an editor/developer action.
 */
export const POST = withAuth(async (request) => {
  const body = await parseJsonBody<{ manifest?: PluginManifest }>(request);
  if (body instanceof NextResponse) return body;
  const { manifest } = body;

  if (!manifest || !validateManifest(manifest)) {
    return NextResponse.json({ error: 'Invalid manifest' }, { status: 400 });
  }

  // Reject wildcard allowedDomains unless the plugin declares localNetwork.
  // That permission opts into a user-configured LAN target (e.g. Home Assistant
  // at homeassistant.local or 192.168.x.x); without it, "*" is meaningless
  // anyway because SSRF defense rejects every realistic private target.
  const allowLan = manifest.permissions?.includes('localNetwork') ?? false;
  if (manifest.allowedDomains?.includes('*') && !allowLan) {
    return NextResponse.json(
      { error: 'Wildcard allowedDomains requires the "localNetwork" permission' },
      { status: 400 },
    );
  }

  await registerDevPlugin(manifest);
  return NextResponse.json({ ok: true });
}, 'Failed to register dev plugin');

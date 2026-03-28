import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { validateManifest, registerDevPlugin } from '@/lib/plugins';
import type { PluginManifest } from '@/types/plugins';

export const dynamic = 'force-dynamic';

/**
 * Register a dev plugin on the server so the proxy can find its manifest
 * and allowedDomains. Called automatically by loadDevPlugin on the client.
 * Requires session auth — this is an editor/developer action.
 */
export const POST = withAuth(async (request) => {
  const { manifest } = (await request.json()) as { manifest: PluginManifest };

  if (!manifest || !validateManifest(manifest)) {
    return NextResponse.json({ error: 'Invalid manifest' }, { status: 400 });
  }

  // Reject wildcard allowedDomains in dev plugins — require explicit domains
  if (manifest.allowedDomains?.includes('*')) {
    return NextResponse.json(
      { error: 'Dev plugins must declare explicit allowedDomains (wildcard "*" is not permitted)' },
      { status: 400 },
    );
  }

  await registerDevPlugin(manifest);
  return NextResponse.json({ success: true });
}, 'Failed to register dev plugin');

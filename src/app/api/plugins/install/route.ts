import { NextRequest, NextResponse } from 'next/server';
import { installPlugin, uninstallPlugin, setPluginEnabled, clearPreviousVersion, fetchRegistry } from '@/lib/plugins';
import { errorResponse, withAuth } from '@/lib/api-utils';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Install a plugin from the registry */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { pluginId, version } = body as { pluginId: string; version: string };
  if (!pluginId || !version) {
    return NextResponse.json({ error: 'pluginId and version are required' }, { status: 400 });
  }

  try {
    const registry = await fetchRegistry();
    const entry = registry.plugins.find((p) => p.id === pluginId);
    if (!entry) {
      return NextResponse.json({ error: 'Plugin not found in registry' }, { status: 404 });
    }

    const versionEntry = entry.versions.find((v) => v.version === version);
    if (!versionEntry) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Download the tarball
    const res = await fetch(versionEntry.downloadUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to download plugin' }, { status: 502 });
    }
    const buffer = Buffer.from(await res.arrayBuffer());

    await installPlugin(entry, version, buffer, versionEntry.sha256);
    audit({ action: 'plugin_install', pluginId, version });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 'Failed to install plugin');
  }
}, 'Failed to install plugin');

/** Uninstall a plugin */
export const DELETE = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { pluginId } = body as { pluginId: string };
  if (!pluginId) {
    return NextResponse.json({ error: 'pluginId is required' }, { status: 400 });
  }

  try {
    await uninstallPlugin(pluginId);
    audit({ action: 'plugin_uninstall', pluginId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 'Failed to uninstall plugin');
  }
}, 'Failed to uninstall plugin');

/** Update a plugin — enable/disable or clear previousVersion after migration */
export const PATCH = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { pluginId, enabled, clearPrevVersion } = body as {
    pluginId: string;
    enabled?: boolean;
    clearPrevVersion?: boolean;
  };
  if (!pluginId) {
    return NextResponse.json({ error: 'pluginId is required' }, { status: 400 });
  }

  try {
    if (typeof enabled === 'boolean') {
      await setPluginEnabled(pluginId, enabled);
    }
    if (clearPrevVersion) {
      await clearPreviousVersion(pluginId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 'Failed to update plugin');
  }
}, 'Failed to update plugin');

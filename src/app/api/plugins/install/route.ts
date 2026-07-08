import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { installPlugin, uninstallPlugin, setPluginEnabled, clearPreviousVersion, fetchRegistry } from '@/lib/plugins';
import { fetchWithTimeout, withAuth, parseJsonBody } from '@/lib/api-utils';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Install a plugin from the registry */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ pluginId?: string; version?: string }>(request);
  if (body instanceof NextResponse) return body;
  const { pluginId, version } = body;
  if (!pluginId || !version) {
    return NextResponse.json({ error: 'pluginId and version are required' }, { status: 400 });
  }

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
  let res: Response;
  try {
    res = await fetchWithTimeout(versionEntry.downloadUrl, { timeout: 60_000 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'network error';
    return NextResponse.json(
      { error: 'Failed to download plugin', detail: `Could not reach ${versionEntry.downloadUrl} — ${detail}` },
      { status: 502 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: 'Failed to download plugin', detail: `${versionEntry.downloadUrl} returned HTTP ${res.status}` },
      { status: 502 },
    );
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  await installPlugin(entry, version, buffer, versionEntry.sha256);
  audit({ action: 'plugin_install', pluginId, version });
  return NextResponse.json({ ok: true });
}, 'Failed to install plugin');

/** Uninstall a plugin */
export const DELETE = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ pluginId?: string }>(request);
  if (body instanceof NextResponse) return body;
  const { pluginId } = body;
  if (!pluginId) {
    return NextResponse.json({ error: 'pluginId is required' }, { status: 400 });
  }

  await uninstallPlugin(pluginId);
  audit({ action: 'plugin_uninstall', pluginId });
  return NextResponse.json({ ok: true });
}, 'Failed to uninstall plugin');

/** Update a plugin — enable/disable or clear previousVersion after migration */
export const PATCH = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{
    pluginId?: string;
    enabled?: boolean;
    clearPrevVersion?: boolean;
  }>(request);
  if (body instanceof NextResponse) return body;
  const { pluginId, enabled, clearPrevVersion } = body;
  if (!pluginId) {
    return NextResponse.json({ error: 'pluginId is required' }, { status: 400 });
  }

  if (typeof enabled === 'boolean') {
    await setPluginEnabled(pluginId, enabled);
  }
  if (clearPrevVersion) {
    await clearPreviousVersion(pluginId);
  }
  return NextResponse.json({ ok: true });
}, 'Failed to update plugin');

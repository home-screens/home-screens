import { NextResponse } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { getPluginManifest } from '@/lib/plugin-utils';
import { getPluginSettings, setPluginSettings } from '@/lib/plugins';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ pluginId: string }> };

/** GET — the plugin's stored settings (non-secret; shaped by settingsSchema) */
export const GET = withAuth<RouteContext>(async (_request, ctx) => {
  const { pluginId } = await ctx.params;
  const manifest = await getPluginManifest(pluginId);
  if (!manifest) {
    return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
  }
  const settings = await getPluginSettings(pluginId);
  return NextResponse.json({ settings });
}, 'Failed to read plugin settings');

/** PUT — replace the plugin's settings object (validated against settingsSchema) */
export const PUT = withAuth<RouteContext>(async (request, ctx) => {
  const { pluginId } = await ctx.params;
  const manifest = await getPluginManifest(pluginId);
  if (!manifest) {
    return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
  }
  if (!manifest.settingsSchema?.properties) {
    return NextResponse.json({ error: 'Plugin has no settings' }, { status: 400 });
  }

  const body = await parseJsonBody<{ settings?: Record<string, unknown> }>(request);
  if (body instanceof NextResponse) return body;
  const { settings } = body;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return NextResponse.json({ error: 'settings (object) is required' }, { status: 400 });
  }

  try {
    const stored = await setPluginSettings(pluginId, settings);
    return NextResponse.json({ ok: true, settings: stored });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid settings';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}, 'Failed to save plugin settings');

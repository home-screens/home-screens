import { NextResponse } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { getPluginManifest } from '@/lib/plugin-utils';
import {
  getPluginSecretStatus,
  setPluginSecret,
  deletePluginSecret,
} from '@/lib/plugin-secrets';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ pluginId: string }> };

/** GET — returns configured status per declared secret (never raw values) */
export const GET = withAuth<RouteContext>(async (_request, ctx) => {
  const { pluginId } = await ctx.params;
  const manifest = await getPluginManifest(pluginId);
  if (!manifest) {
    return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
  }
  const keys = await getPluginSecretStatus(pluginId);
  return NextResponse.json({ keys });
}, 'Failed to read plugin secrets');

/** PUT — set a single secret value */
export const PUT = withAuth<RouteContext>(async (request, ctx) => {
  const { pluginId } = await ctx.params;
  const manifest = await getPluginManifest(pluginId);
  if (!manifest) {
    return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
  }

  const body = await parseJsonBody<{ key?: string; value?: string }>(request);
  if (body instanceof NextResponse) return body;
  const { key, value } = body;
  if (!key || typeof value !== 'string' || !value.trim()) {
    return NextResponse.json({ error: 'key and non-empty value (string) are required' }, { status: 400 });
  }

  await setPluginSecret(pluginId, key, value);
  return NextResponse.json({ ok: true });
}, 'Failed to set plugin secret');

/** DELETE — remove a single secret */
export const DELETE = withAuth<RouteContext>(async (request, ctx) => {
  const { pluginId } = await ctx.params;
  const manifest = await getPluginManifest(pluginId);
  if (!manifest) {
    return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
  }

  const body = await parseJsonBody<{ key?: string }>(request);
  if (body instanceof NextResponse) return body;
  const { key } = body;
  if (!key) {
    return NextResponse.json({ error: 'key is required' }, { status: 400 });
  }

  await deletePluginSecret(pluginId, key);
  return NextResponse.json({ ok: true });
}, 'Failed to delete plugin secret');

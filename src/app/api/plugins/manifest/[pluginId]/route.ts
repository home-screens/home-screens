import { NextResponse } from 'next/server';
import { getPluginManifest } from '@/lib/plugins';
import { errorResponse, withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ pluginId: string }> };

export const GET = withDisplayAuth<RouteContext>(async (_request, ctx) => {
  try {
    const { pluginId } = await ctx.params;
    const manifest = await getPluginManifest(pluginId);
    if (!manifest) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
    }
    return NextResponse.json(manifest);
  } catch (error) {
    return errorResponse(error, 'Failed to read plugin manifest');
  }
}, 'Failed to read plugin manifest');

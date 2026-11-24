import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getPluginBundlePath } from '@/lib/plugins';
import { pluginDir } from '@/lib/plugin-utils';
import { errorResponse, withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ pluginId: string }> };

export const GET = withDisplayAuth<RouteContext>(async (_request, ctx) => {
  try {
    const { pluginId } = await ctx.params;
    // The bundle must really sit inside the plugin's own folder: a link in
    // its place could point at any file the hub can read.
    const realDir = await fs.realpath(pluginDir(pluginId));
    const bundlePath = await fs.realpath(getPluginBundlePath(pluginId));
    if (!bundlePath.startsWith(realDir + path.sep)) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
    }
    const content = await fs.readFile(bundlePath, 'utf-8');
    return new NextResponse(content, {
      headers: { 'Content-Type': 'application/javascript' },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
    }
    return errorResponse(error, 'Failed to serve plugin bundle');
  }
}, 'Failed to serve plugin bundle');

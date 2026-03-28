import { NextResponse } from 'next/server';
import { getInstalledPlugins, getPluginHash } from '@/lib/plugins';
import { errorResponse, withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  try {
    const installed = await getInstalledPlugins();
    const pluginHash = await getPluginHash();
    return NextResponse.json({ ...installed, pluginHash });
  } catch (error) {
    return errorResponse(error, 'Failed to read installed plugins');
  }
}, 'Failed to read installed plugins');

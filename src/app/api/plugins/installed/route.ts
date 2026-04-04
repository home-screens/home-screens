import { NextResponse } from 'next/server';
import { getInstalledPlugins, getPluginHash } from '@/lib/plugins';
import { withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  const installed = await getInstalledPlugins();
  const pluginHash = await getPluginHash();
  return NextResponse.json({ ...installed, pluginHash });
}, 'Failed to read installed plugins');

import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { scanMediaUsage, scanMissingMedia, slideshowFolders } from '@/lib/media-usage';
import { withAuth } from '@/lib/api-utils';
import { volumeSpace, walkLibrary } from '@/lib/library-files';
import type { MediaInventory, MediaInventoryStorage } from '@/lib/media-inventory';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const { items, directories, hidden } = await walkLibrary();

  // Only paths that exist in the library can be "in use", so the known-path
  // set comes straight from the walk.
  const config = await readConfig();
  const knownPaths = new Set(items.map((item) => item.path));
  const usageMap = scanMediaUsage(config, knownPaths);
  const usage: MediaInventory['usage'] = {};
  for (const [p, uses] of usageMap) usage[p] = uses;

  const missing = scanMissingMedia(
    config,
    new Set([...knownPaths, ...hidden]),
    new Set(directories.map((d) => d.path)),
  );

  const storage: MediaInventoryStorage = {
    bytes: items.reduce((sum, item) => sum + item.bytes, 0),
    ...(await volumeSpace()),
  };

  const inventory: MediaInventory = { items, directories, usage, missing, storage, slideshows: slideshowFolders(config) };
  return NextResponse.json(inventory);
}, 'Failed to build media inventory');

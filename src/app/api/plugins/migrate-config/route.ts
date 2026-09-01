import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { updateConfigAtomic, configRevision } from '@/lib/config';
import { CONFIG_REVISION_HEADER } from '@/lib/config-revision';
import { getPluginManifest, PLUGIN_ID_PATTERN } from '@/lib/plugin-utils';
import { migrateConfigModules } from '@/lib/plugin-config-migration';

/**
 * Run a plugin's config migration server-side.
 *
 * This used to happen in the browser as `GET /api/config` → mutate → `PUT
 * /api/config`, which had two defects: it reverted anything the editor saved
 * between the read and the write (and it ran automatically on plugin load *in
 * the editor*, i.e. exactly while the user was editing), and it walked only
 * the legacy `config.screens` pool so every instance on every added display
 * was silently skipped.
 *
 * Running through `updateConfigAtomic` puts the read-modify-write in the
 * shared json-store queue, which serializes it against editor saves.
 *
 * The manifest is read from disk rather than accepted from the caller: the
 * request body only names which plugin to migrate, so a client cannot inject
 * arbitrary migration rules into the config.
 */
export const POST = withAuth(async (request: NextRequest) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { pluginId, oldVersion } = (body ?? {}) as { pluginId?: unknown; oldVersion?: unknown };

  if (typeof pluginId !== 'string' || !PLUGIN_ID_PATTERN.test(pluginId)) {
    return NextResponse.json({ error: 'Invalid plugin ID' }, { status: 400 });
  }
  if (typeof oldVersion !== 'string' || oldVersion.length === 0) {
    return NextResponse.json({ error: 'Missing oldVersion' }, { status: 400 });
  }

  const manifest = await getPluginManifest(pluginId);
  if (!manifest) {
    return NextResponse.json({ error: 'Plugin not installed' }, { status: 404 });
  }

  let changed = false;
  const result = await updateConfigAtomic((current) => {
    changed = migrateConfigModules(current, manifest, oldVersion);
    // `updateConfigAtomic` skips the disk write when the mutator returns the
    // reference it was given, so a mutated-in-place config MUST come back as a
    // new object or the migration would never persist. Returning `current`
    // unchanged is the intended no-op signal.
    return changed ? { ...current } : current;
  });

  // The revision after the write, so the editor can move onto it instead of
  // tripping a save conflict against its own plugin update.
  return NextResponse.json({ ok: true, changed }, { headers: { [CONFIG_REVISION_HEADER]: configRevision(result) } });
}, 'Failed to migrate plugin config');

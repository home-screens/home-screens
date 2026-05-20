import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { pluginDir, PLUGIN_ID_PATTERN } from '@/lib/plugin-utils';
import { errorResponse, withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ pluginId: string; path: string[] }> };

/**
 * Serve a single arbitrary asset file from a plugin's on-disk directory.
 *
 * Used by `plugin-loader.loadPluginTranslations` to fetch
 * `manifest.translations[<locale>]` files (e.g. `translations/de-DE.json`),
 * but the route is general — any file under the plugin root can be
 * requested by relative path. Path traversal is rejected; the resolved
 * path must be a strict descendant of the plugin directory.
 *
 * Cache TTL is short (5 min) because translation files (and other plugin
 * assets) can change as plugins update on disk; long TTLs would mask new
 * versions until the browser cache expired.
 */
async function handler(
  _request: Request,
  ctx: RouteContext,
): Promise<NextResponse> {
  const { pluginId, path: pathSegments } = await ctx.params;

  if (typeof pluginId !== 'string' || !PLUGIN_ID_PATTERN.test(pluginId)) {
    return NextResponse.json({ error: 'Invalid plugin id' }, { status: 400 });
  }

  if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
    return NextResponse.json({ error: 'Missing asset path' }, { status: 400 });
  }

  // Reject any segment that contains its own separator, parent traversal,
  // NUL byte, or is empty/dot. These would all be obvious manifest typos
  // or probe attempts; the resolved-path containment check below is the
  // defense-in-depth, but rejecting at parse time keeps the audit trail
  // clear.
  for (const seg of pathSegments) {
    if (
      typeof seg !== 'string'
      || seg.length === 0
      || seg === '.'
      || seg === '..'
      || seg.includes('/')
      || seg.includes('\\')
      || seg.includes('\0')
    ) {
      return NextResponse.json({ error: 'Invalid asset path' }, { status: 400 });
    }
  }

  let baseDir: string;
  try {
    baseDir = pluginDir(pluginId);
  } catch {
    // pluginDir() throws via sanitizePluginId() — re-issue as 400.
    return NextResponse.json({ error: 'Invalid plugin id' }, { status: 400 });
  }

  const absoluteBase = path.resolve(baseDir);
  const requested = path.resolve(absoluteBase, ...pathSegments);

  // Defense-in-depth: even after segment-level filtering, verify the
  // resolved path is strictly inside the plugin directory. The trailing
  // separator on the prefix prevents `data/plugins/foo-bar` from matching
  // a sibling `data/plugins/foo` directory.
  const containmentPrefix = absoluteBase + path.sep;
  if (
    requested !== absoluteBase
    && !requested.startsWith(containmentPrefix)
  ) {
    return NextResponse.json({ error: 'Invalid asset path' }, { status: 400 });
  }

  let content: Buffer;
  try {
    content = await fs.readFile(requested);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT'
      || (error as NodeJS.ErrnoException).code === 'EISDIR') {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    return errorResponse(error, 'Failed to serve plugin asset');
  }

  // Pick a Content-Type based on extension. JSON is the only typed case
  // we care about right now (translations); everything else gets the
  // generic byte-stream type so the browser doesn't try to interpret it.
  const ext = path.extname(requested).toLowerCase();
  const contentType =
    ext === '.json' ? 'application/json'
    : ext === '.txt' ? 'text/plain; charset=utf-8'
    : 'application/octet-stream';

  // BodyInit accepts ArrayBuffer; copy the relevant slice out of the
  // Buffer (which may be a view into a larger pooled allocation) so we
  // hand back exactly the file bytes.
  const body = content.buffer.slice(
    content.byteOffset,
    content.byteOffset + content.byteLength,
  );

  return new NextResponse(body as ArrayBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}

export const GET = withDisplayAuth<RouteContext>(handler, 'Failed to serve plugin asset');

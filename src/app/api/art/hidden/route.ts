import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody, withAuth } from '@/lib/api-utils';
import { normalizeArtHidden, withArtHidden } from '@/lib/art-hidden';
import { updateConfigAtomic } from '@/lib/config';
import { isCollectionPainting } from '@/lib/photo-sources/art';

export const dynamic = 'force-dynamic';

/**
 * POST /api/art/hidden { id, hidden } -> { hidden: string[] }
 *
 * "Don't show again" for one painting of the art collection (`hidden: true`),
 * or its Undo (`hidden: false`). The list is the household's
 * (`settings.artHidden`), so the painting stays away from every wall, and
 * `hidden: []` with no `id` shows every painting again.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ id?: unknown; hidden?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const clearAll = body.id === undefined && Array.isArray(body.hidden) && body.hidden.length === 0;
  if (!clearAll) {
    if (typeof body.id !== 'string' || !isCollectionPainting(body.id)) return NextResponse.json({ error: 'Unknown painting' }, { status: 400 });
    if (typeof body.hidden !== 'boolean') return NextResponse.json({ error: 'Say whether to hide the painting' }, { status: 400 });
  }
  const saved = await updateConfigAtomic((config) => {
    const { artHidden: _was, ...settings } = config.settings;
    const next = clearAll ? undefined : withArtHidden(config.settings.artHidden, body.id as string, body.hidden as boolean);
    return { ...config, settings: next ? { ...settings, artHidden: next } : settings };
  });
  return NextResponse.json({ hidden: normalizeArtHidden(saved.settings.artHidden) });
}, 'Failed to save the hidden paintings');

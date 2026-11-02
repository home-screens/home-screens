import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody, withAuth } from '@/lib/api-utils';
import { IMPORT_FOLDER, cleanLibraryFolder, isPickImportKind, isValidPickRef } from '@/lib/photo-source';
import { getPickableSource, photoSourceErrorResponse } from '@/lib/photo-sources';
import { safeLibraryPath } from '@/lib/library-files';
import { serveUrlFor } from '@/lib/media-paths';

export const dynamic = 'force-dynamic';

/**
 * POST /api/photo-source/import { kind, ref, folder? } -> { path, file, reused }
 *
 * Copy one picture picked in the Image Library into the media library, so
 * the wall never needs Immich, Unsplash or NASA to be up to show it. The hub
 * downloads it itself, under the import size cap, into the source's own
 * folder unless `folder` names another. Picking the same picture again
 * reuses the copy. `path` is the serve URL a module or screen stores.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ kind?: unknown; ref?: unknown; folder?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const { kind, ref } = body;
  if (!isPickImportKind(kind)) return NextResponse.json({ error: 'Unknown photo source' }, { status: 400 });
  if (typeof ref !== 'string' || !isValidPickRef(kind, ref)) {
    return NextResponse.json({ error: 'Invalid picture' }, { status: 400 });
  }
  if (body.folder != null && typeof body.folder !== 'string') {
    return NextResponse.json({ error: 'Invalid folder' }, { status: 400 });
  }
  const folder = body.folder != null ? cleanLibraryFolder(body.folder as string) : IMPORT_FOLDER[kind];
  if (folder && !safeLibraryPath(folder)) return NextResponse.json({ error: 'Invalid folder' }, { status: 400 });

  try {
    const { path, reused } = await getPickableSource(kind).importOne({ ref, folder });
    return NextResponse.json({ path: serveUrlFor(path), file: path, reused }, { status: reused ? 200 : 201 });
  } catch (error) {
    const explained = photoSourceErrorResponse(error);
    if (explained) return explained;
    throw error;
  }
}, 'Failed to save the picture');

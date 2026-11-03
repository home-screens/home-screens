import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { moveLibraryFiles } from '@/lib/library-moves';

export const dynamic = 'force-dynamic';

/**
 * POST /api/backgrounds/move  { files: string[], directory: string }
 *
 * Moves library files into a folder ('' for the top level) under their own
 * names and rewrites every config reference to follow them. All-or-nothing
 * up front: a clash or a bad path refuses the batch before anything moves,
 * as a `LibraryMoveError` the route wrapper answers with its code.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ files?: unknown; directory?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const { files, directory } = body;
  if (!Array.isArray(files) || files.length === 0 || !files.every((f) => typeof f === 'string')) {
    return NextResponse.json({ error: 'files is required' }, { status: 400 });
  }
  if (typeof directory !== 'string') {
    return NextResponse.json({ error: 'directory is required' }, { status: 400 });
  }
  return NextResponse.json(await moveLibraryFiles(files as string[], directory));
}, 'Failed to move files');

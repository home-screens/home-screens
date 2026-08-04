import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { getPickerImport, startPickerImport } from '@/lib/google-picker';

export const dynamic = 'force-dynamic';

/**
 * POST /api/google-picker/import { sessionId, folder? } — download everything
 * the user picked into the local library. GET ?jobId= polls progress.
 * Mirrors /api/icloud/import (editor-session only; writes the media library).
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ sessionId?: unknown; folder?: unknown }>(request);
  if (body instanceof NextResponse) return body;

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const folder = typeof body.folder === 'string' ? body.folder : 'google-photos';
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const started = await startPickerImport(sessionId, folder);
  if ('error' in started) {
    const status = started.error === 'busy' ? 409 : 400;
    return NextResponse.json({ error: started.error }, { status });
  }
  return NextResponse.json(started, { status: 202 });
}, 'Failed to start Google Photos import');

export const GET = withAuth(async (request: NextRequest) => {
  const jobId = request.nextUrl.searchParams.get('jobId') || '';
  const job = getPickerImport(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  return NextResponse.json(job);
}, 'Failed to read Google Photos import status');

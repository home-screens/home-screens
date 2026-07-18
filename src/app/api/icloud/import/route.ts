import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { getICloudImport, startICloudImport } from '@/lib/icloud-import';

export const dynamic = 'force-dynamic';

/**
 * POST /api/icloud/import { url, folder? } — start downloading everything an
 * Apple link (Shared Album or iCloud Link) contains into the local library.
 * GET  /api/icloud/import?jobId=… — poll the running job's progress.
 *
 * Editor-session only: imports write to the media library, which is an
 * editor-side management operation (same auth as background uploads).
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ url?: unknown; folder?: unknown }>(request);
  if (body instanceof NextResponse) return body;

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const folder = typeof body.folder === 'string' ? body.folder : '';
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const started = await startICloudImport(url, folder);
  if ('error' in started) {
    // 409 for a concurrent import; 400 for anything wrong with the request.
    const status = started.error === 'busy' ? 409 : 400;
    return NextResponse.json({ error: started.error }, { status });
  }
  return NextResponse.json(started, { status: 202 });
}, 'Failed to start iCloud import');

export const GET = withAuth(async (request: NextRequest) => {
  const jobId = request.nextUrl.searchParams.get('jobId') || '';
  const job = getICloudImport(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  return NextResponse.json(job);
}, 'Failed to read iCloud import status');

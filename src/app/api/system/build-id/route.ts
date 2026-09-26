import { NextResponse } from 'next/server';
import { readBuildId } from '@/lib/build-id';

export const dynamic = 'force-dynamic';

/**
 * GET /api/system/build-id — returns the Next.js build ID.
 *
 * Intentionally public (no auth). A wall learns the build id from its
 * heartbeat, and falls back to this endpoint when the heartbeat is refused.
 * If this endpoint required auth, client code from before an auth-changing
 * deploy could never detect the new build and would stay on stale JS forever.
 */
export async function GET() {
  return new NextResponse(await readBuildId(), {
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  });
}

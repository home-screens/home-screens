import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

let cachedBuildId: string | null = null;

/**
 * GET /api/system/build-id — returns the Next.js build ID.
 *
 * Intentionally public (no auth). The display client polls this to detect
 * server redeployments and trigger a page reload. If this endpoint requires
 * auth, old client code (from before an auth-adding deploy) can never detect
 * the new build and stays stuck on stale JS forever.
 */
export async function GET() {
  if (!cachedBuildId) {
    try {
      cachedBuildId = (
        await fs.readFile(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf-8')
      ).trim();
    } catch {
      cachedBuildId = 'unknown';
    }
  }
  return new NextResponse(cachedBuildId, {
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  });
}

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { withDisplayAuth } from '@/lib/api-utils';

let cachedBuildId: string | null = null;

export const GET = withDisplayAuth(async () => {
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
}, 'Failed to read build ID');

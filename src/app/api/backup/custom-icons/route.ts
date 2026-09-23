import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { readCustomIconBackup, readCustomIcons } from '@/lib/custom-icon-data';
import { libraryBytes } from '@/lib/custom-icons';

export const dynamic = 'force-dynamic';

/**
 * The optional `customIcons` section of a backup. `GET /api/backup` never
 * carries it; the export adds it only when the family leaves "Include your
 * icons" on. `?summary=1` answers the count and size for that switch's
 * label without sending any pictures.
 */
export const GET = withAuth(async (request: NextRequest) => {
  if (request.nextUrl.searchParams.get('summary') === '1') {
    const icons = await readCustomIcons();
    return NextResponse.json({ count: icons.length, bytes: libraryBytes(icons) });
  }
  return NextResponse.json(await readCustomIconBackup());
}, 'Failed to back up icons');

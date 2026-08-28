import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { listFolders, OneDriveError } from '@/lib/onedrive';
import { isOneDriveItemId } from '@/lib/onedrive-shared';

export const dynamic = 'force-dynamic';

/** Folder-browser data for the editor panel: a folder plus its subfolders. */
export const GET = withAuth(async (request: NextRequest) => {
  const itemId = request.nextUrl.searchParams.get('itemId') || undefined;
  if (itemId && !isOneDriveItemId(itemId)) {
    return NextResponse.json({ error: 'Invalid folder ID' }, { status: 400 });
  }
  try {
    return NextResponse.json(await listFolders(itemId));
  } catch (error) {
    if (error instanceof OneDriveError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error; // withAuth answers 500
  }
}, 'Could not list OneDrive folders');

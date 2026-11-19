import { NextResponse } from 'next/server';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';

/**
 * A backup file on disk as a download, streamed so a gigabyte zip never sits
 * in memory. Null when the file is gone.
 */
export async function backupFileResponse(file: string): Promise<NextResponse | null> {
  let size: number;
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) return null;
    size = stat.size;
  } catch {
    return null;
  }
  const name = path.basename(file);
  return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      'Content-Type': name.endsWith('.zip') ? 'application/zip' : 'application/json',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}

'use client';

import { editorFetch } from '@/lib/editor-fetch';

/**
 * Client-side counterpart to `library-files.ts` (the server's filesystem
 * plumbing): the media-library wire shapes and mutations shared by the
 * editor's `useImageLibrary` and the /remote Photos tab.
 */

/** One entry of `GET /api/backgrounds/directories`. */
export interface DirectoryInfo {
  name: string;
  path: string;
  imageCount: number;
}

/**
 * Delete a library file given its serve URL
 * (`/api/backgrounds/serve?file=<dir>/<name>`). Returns null without issuing
 * a request when the URL carries no `file` param; otherwise returns the
 * DELETE response for the caller to branch on.
 */
export async function deleteLibraryImage(imageUrl: string): Promise<Response | null> {
  const url = new URL(imageUrl, 'http://localhost');
  const file = url.searchParams.get('file') || '';
  if (!file) return null;

  // Split the library-relative path into directory and basename, which is
  // the shape the DELETE endpoint expects.
  const parts = file.split('/');
  const basename = parts.pop() || '';
  const directory = parts.join('/');

  return editorFetch('/api/backgrounds', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: basename, directory: directory || undefined }),
  });
}

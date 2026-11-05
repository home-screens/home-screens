'use client';

import { editorFetch } from '@/lib/editor-fetch';
import { invalidateLibraryReads } from '@/lib/library-client';
import type { PickImportKind } from '@/lib/photo-source';

/** A copy that failed, with the sentence to show (already translated where the hub sent one). */
export class PictureImportError extends Error {
  constructor(message: string, public readonly status: number, public readonly body: unknown) {
    super(message);
    this.name = 'PictureImportError';
  }
}

/**
 * Copy one picked picture into the library through the hub and return the
 * serve URL to store. The hub downloads it, so the browser never carries the
 * bytes, and picking the same picture again reuses the copy.
 */
export async function importPicture(kind: PickImportKind, ref: string): Promise<string> {
  const res = await editorFetch('/api/photo-source/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, ref }),
    // The hub downloads the picture under its own time limits.
    timeoutMs: null,
  });
  const body = await res.json().catch(() => null) as { path?: string; error?: string } | null;
  if (!res.ok || !body?.path) throw new PictureImportError(body?.error ?? '', res.status, body);
  invalidateLibraryReads();
  return body.path;
}

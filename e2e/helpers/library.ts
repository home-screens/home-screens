import { expect, type APIRequestContext } from '@playwright/test';

/** 1x1 transparent PNG: a real image the upload check and the serve route both accept. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A library folder name no other test or worker uses. Only characters the
 * folder-name sanitizer keeps ([A-Za-z0-9._-]).
 */
export function uniqueFolder(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Upload one picture into a library folder through the real upload route. */
export async function seedImage(
  request: APIRequestContext,
  directory: string,
  name: string,
  bytes: Buffer = PNG_1X1,
): Promise<void> {
  const res = await request.post('/api/backgrounds', {
    multipart: { directory, file: { name, mimeType: 'image/png', buffer: bytes } },
  });
  expect(res.ok()).toBe(true);
}

/** Remove a library folder through the API. The route refuses a folder that still holds files. */
export async function removeFolder(request: APIRequestContext, folder: string): Promise<void> {
  await request.delete('/api/backgrounds/directories', { data: { path: folder } }).catch(() => {});
}

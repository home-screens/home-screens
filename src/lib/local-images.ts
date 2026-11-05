/** Library-relative file a chosen picture's serve URL points at (client-safe; the editor and the server read it the same way). */
export function localImageFileOf(servePath: string): string {
  try {
    return new URL(servePath, 'http://local').searchParams.get('file') ?? servePath;
  } catch {
    return servePath;
  }
}

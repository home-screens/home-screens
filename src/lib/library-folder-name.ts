/**
 * Folder names in the photo library become real directory names on disk, so
 * anything outside `[A-Za-z0-9._-]` is replaced with a hyphen and leading dots
 * are stripped (blocking "." and ".."). The rule lives here rather than inside
 * the API route so the phone can show what a typed name will actually be
 * saved as — "Vacation 2026" quietly turning into "Vacation-2026" after the
 * fact looked like the app had ignored what was typed.
 */
export const MAX_FOLDER_NAME_LENGTH = 50;

export function sanitizeFolderName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^\.+/, '')
    .slice(0, MAX_FOLDER_NAME_LENGTH);
}

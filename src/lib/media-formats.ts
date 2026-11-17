/**
 * Every image and video format the media library knows, and the size caps
 * uploads and imports are held to. Pure data, so the phone and the editor can
 * check a file before sending it with the same numbers the hub enforces.
 *
 * The upload gate, the folder listings, the served content-type and the usage
 * scan all derive from these two tables, so adding a format here is the whole
 * change (svg once landed in three of four places and folder counts disagreed
 * with folder listings).
 */

export const IMAGE_MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  // JPEG spellings some cameras and sites produce; all are image/jpeg.
  '.jfif': 'image/jpeg',
  '.pjpeg': 'image/jpeg',
  '.pjp': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

export const VIDEO_MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function extensionPattern(table: Readonly<Record<string, string>>): RegExp {
  return new RegExp(`\\.(${Object.keys(table).map((ext) => ext.slice(1)).join('|')})$`, 'i');
}

/** Filename tests for library entries (case-insensitive, extension only). */
export const IMAGE_FILE_RE = extensionPattern(IMAGE_MIME_BY_EXT);
export const VIDEO_FILE_RE = extensionPattern(VIDEO_MIME_BY_EXT);

/** MIME types uploads may declare, one per distinct format. */
export const IMAGE_MIME_TYPES: readonly string[] = [...new Set(Object.values(IMAGE_MIME_BY_EXT))];
export const VIDEO_MIME_TYPES: readonly string[] = [...new Set(Object.values(VIDEO_MIME_BY_EXT))];

/** Whether a library file is a picture or a video, by its name; null for anything else. */
export function mediaKindOf(fileName: string): 'image' | 'video' | null {
  if (IMAGE_FILE_RE.test(fileName)) return 'image';
  if (VIDEO_FILE_RE.test(fileName)) return 'video';
  return null;
}

/** Size caps shared by uploads and imports. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image file
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB per video file

/** Server-fetched images (iCloud imports, background rotation) get a higher
 *  ceiling than uploads: Apple originals (48 MP photos) legitimately exceed
 *  10 MB. */
export const MAX_IMPORT_IMAGE_BYTES = 50 * 1024 * 1024;

/**
 * Raster pictures and videos a download may be saved as, by the media type a
 * server answered with. SVG is left out on purpose: a picture fetched from
 * another service is only ever a photo, and an SVG from elsewhere could carry
 * script. TIFF, HEIC and BMP are left out because the display can't show
 * them; saving their bytes under `.jpg` gave the wall JPEG headers over TIFF
 * data and a broken picture.
 */
const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

/**
 * The extension to save a download under, from its Content-Type (parameters
 * such as `; charset=binary` ignored), or null when the type is not one the
 * display can show. `kind` limits the answer to pictures or videos.
 */
export function extensionForContentType(contentType: string | null | undefined, kind?: 'image' | 'video'): string | null {
  const mediaType = (contentType ?? '').split(';')[0].trim().toLowerCase();
  const ext = EXTENSION_BY_CONTENT_TYPE[mediaType];
  if (!ext) return null;
  if (kind && !mediaType.startsWith(`${kind}/`)) return null;
  return ext;
}

/** How much of a picture's start `sniffImageContentType` needs. */
export const PICTURE_HEAD_BYTES = 12;

/**
 * What a raster picture is, read from its first bytes, as the media type a
 * browser would be told; null when they are not one of the formats above.
 * For a server that answers every file as `application/octet-stream` (the
 * newer iCloud shared albums and some picture archives do), where the
 * Content-Type says nothing.
 */
export function sniffImageContentType(head: Uint8Array): string | null {
  const starts = (bytes: readonly number[], at = 0) => bytes.every((byte, i) => head[at + i] === byte);
  const ascii = (text: string, at: number) => starts([...text].map((char) => char.charCodeAt(0)), at);
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii('GIF87a', 0) || ascii('GIF89a', 0)) return 'image/gif';
  if (ascii('RIFF', 0) && ascii('WEBP', 8)) return 'image/webp';
  if (ascii('ftypavif', 4) || ascii('ftypavis', 4)) return 'image/avif';
  return null;
}

/**
 * The media type of a picture the display can show: the one its server
 * declared when that names such a picture, otherwise what its first bytes
 * say, otherwise null. The one rule for "what is this download" where the
 * answer is a picture; `identifyDownload` (library-files.ts) applies it to a
 * download that is saved, and the routes that hand bytes straight to a
 * browser apply it to the bytes they hold.
 */
export function pictureContentType(declared: string | null | undefined, head: Uint8Array): string | null {
  if (declared && extensionForContentType(declared, 'image')) return declared;
  return sniffImageContentType(head);
}

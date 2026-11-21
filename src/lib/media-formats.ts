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

/**
 * The moving half of a Live Photo, written beside its still as
 * `<same name>.live.mov`.
 *
 * It stays an ordinary library video in every other respect: it is listed,
 * counted, backed up, moved and deleted like any other file, and the only
 * thing this name buys is that a slideshow showing the still plays it over
 * the top. Hiding it instead meant every count, size, move, delete and
 * backup needed a special case, and the ones that were missed lost files.
 *
 * The suffix is explicit rather than matching on a shared base name,
 * because a plain camera dump legitimately holds `IMG_1234.JPG` next to
 * `IMG_1234.MOV` as two separate things a household wants shown
 * separately. Pairing those by name would silently swallow the video.
 */
export const LIVE_COMPANION_RE = /\.live\.(mp4|mov)$/i;

/**
 * The companion names a still could have, in the order to look for them.
 *
 * Both containers, because Apple hands these out as QuickTime: a Live Photo
 * clip is H.264 video and AAC audio, which every browser plays, wrapped in a
 * `qt  ` container rather than an MP4 one. Renaming it `.mp4` would make the
 * serve route declare `video/mp4` over QuickTime bytes, so it keeps `.mov`
 * and the type that goes with it. `.mp4` is accepted for anything that does
 * arrive in the other container.
 *
 * Never gate playback on `canPlayType`. Chromium answers `''` for
 * `video/quicktime`, and for it with the codecs spelled out, yet plays the
 * file anyway: it reads the container rather than trusting the declared
 * type. Measured on a Raspberry Pi 5 (Chromium 156, Debian 13) against a
 * real clip served as `video/quicktime` over HTTP, which reached
 * `readyState` 4 at 720x960. A capability check added here later would
 * turn every Live Photo back into a still and read as a pairing bug.
 */
export function liveCompanionsFor(stillName: string): string[] {
  const base = stillName.replace(/\.[^.]+$/, '');
  return [`${base}.live.mov`, `${base}.live.mp4`];
}

/**
 * One pass over a folder's names, giving back a lookup from a still to the
 * clip beside it.
 *
 * The one place the pairing rule lives, so a folder of 840 pictures costs
 * one pass rather than a scan per picture.
 *
 * Keyed on the lowercased name so a clip a Mac wrote as `IMG_1.live.MOV` is
 * found by the same single lookup.
 */
export function clipIndex(names: Iterable<string>): (stillName: string) => string | undefined {
  const byLower = new Map<string, string>();
  // How many stills in this folder would claim each clip. Two pictures can:
  // `a.jpg` and `a.png` both resolve to `a.live.mov`, and on a case-sensitive
  // disk so do `IMG_1.JPG` and `IMG_1.jpg`. There is no way to tell whose
  // moment it was, so a contested clip moves nothing: playing it over both
  // pictures would put one photo's movement over the other's.
  const claims = new Map<string, number>();
  const stills: string[] = [];
  for (const name of names) {
    if (LIVE_COMPANION_RE.test(name)) byLower.set(name.toLowerCase(), name);
    // Only a picture owns a clip. A camera saves IMG_1.JPG beside IMG_1.MOV,
    // and counting that video as a claimant would make the clip contested
    // and leave the photograph without its motion.
    else if (mediaKindOf(name) === 'image') stills.push(name);
  }
  for (const still of stills) {
    for (const candidate of liveCompanionsFor(still)) {
      const key = candidate.toLowerCase();
      if (byLower.has(key)) { claims.set(key, (claims.get(key) ?? 0) + 1); break; }
    }
  }
  return (stillName) => {
    for (const candidate of liveCompanionsFor(stillName)) {
      const key = candidate.toLowerCase();
      const found = byLower.get(key);
      if (found) return (claims.get(key) ?? 0) > 1 ? undefined : found;
    }
    return undefined;
  };
}

/** MIME types uploads may declare, one per distinct format. */
export const IMAGE_MIME_TYPES: readonly string[] = [...new Set(Object.values(IMAGE_MIME_BY_EXT))];
export const VIDEO_MIME_TYPES: readonly string[] = [...new Set(Object.values(VIDEO_MIME_BY_EXT))];

const VIDEO_ACCEPT = VIDEO_MIME_TYPES.join(',');

/**
 * What a file picker that adds to the library offers. The editor's pickers
 * take any picture (`image/*`). The phone lists its picture types one by
 * one instead, which is what makes an iPhone hand over a HEIC photo as a
 * JPEG; the two spellings are both on purpose.
 */
export const LIBRARY_PICKER_ACCEPT = {
  image: 'image/*',
  video: VIDEO_ACCEPT,
  both: `image/*,${VIDEO_ACCEPT}`,
  phone: `${IMAGE_MIME_TYPES.filter((type) => type !== 'image/svg+xml').join(',')},${VIDEO_ACCEPT}`,
} as const;

/** Whether a picked file is a video, by its declared type or, failing that, its name. */
export function isVideoUpload(file: { type: string; name: string }): boolean {
  return file.type.startsWith('video/') || mediaKindOf(file.name) === 'video';
}

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

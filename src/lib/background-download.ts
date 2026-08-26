import path from 'path';
import { promises as fs } from 'fs';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { fetchWithTimeout } from '@/lib/api-utils';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

/**
 * Image formats a browser can render, mapped to the extension we save them
 * under. Matches MIME_TYPES in /api/backgrounds/serve, which derives the
 * response content-type from the saved extension — save a TIFF as .jpg and
 * the display gets JPEG headers over TIFF bytes and shows a broken image.
 */
const WEB_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

/**
 * Thrown when the source is a real image the display cannot render (TIFF,
 * HEIC, BMP...). Callers turn this into a 415 with the message intact — it is
 * written to be shown to a person, not parsed.
 */
export class UnsupportedImageFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedImageFormatError';
  }
}

interface DownloadOptions {
  timeout?: number;
  /**
   * Refuse formats the display cannot render instead of saving bytes under a
   * misleading extension. Off by default: most sources (Unsplash, uploads)
   * only ever hand back web formats, while NASA's archive does occasionally
   * serve TIFF.
   */
  rejectNonWeb?: boolean;
  validateImage?: boolean;
}

export async function downloadAndSaveBackground(
  imageUrl: string,
  filenamePrefix: string,
  options?: DownloadOptions,
): Promise<{ path: string }> {
  const { timeout = 60_000, rejectNonWeb = false, validateImage = false } = options ?? {};

  const res = await fetchWithTimeout(imageUrl, { timeout });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

  const contentType = res.headers.get('content-type') ?? 'image/jpeg';

  if (validateImage) {
    const hasImageType = contentType.startsWith('image/');
    const hasImageExt = /\.(jpe?g|png|webp|gif|tiff?)(\?|$)/i.test(imageUrl);
    if (!hasImageType && !hasImageExt) {
      throw new Error('URL did not return an image');
    }
  }
  const buffer: Buffer = Buffer.from(await res.arrayBuffer());

  // Content-type can carry parameters ("image/jpeg; charset=binary").
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  const isTiff = mediaType.includes('tiff') || /\.tiff?(\?|$)/i.test(imageUrl);
  const webExt = isTiff ? undefined : WEB_IMAGE_EXTENSIONS[mediaType];

  if (rejectNonWeb && !webExt) {
    throw new UnsupportedImageFormatError(
      "This picture is in a format the display can't show. Try a different one.",
    );
  }

  const ext = webExt ?? '.jpg';
  const safeName = filenamePrefix.replace(/[^a-zA-Z0-9._-]/g, '_') + ext;

  await fs.mkdir(BGS, { recursive: true });
  await fs.writeFile(path.join(BGS, safeName), buffer);

  return { path: `/api/backgrounds/serve?file=${encodeURIComponent(safeName)}` };
}

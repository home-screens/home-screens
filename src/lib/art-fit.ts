import type { ArtFit, ArtOrientation } from '@/types/config';

interface ArtFilters {
  orientation?: ArtOrientation;
  minShortSide: number;
  /** Allowed aspect difference from the screen, as a fraction. */
  aspectTolerance?: number;
}

type Canvas = { w: number; h: number };

/** Closer shapes need no matte. */
const SAME_SHAPE = 0.03;
const MATTE_BRIGHTNESS = 0.4;
const CONTAIN_BACKGROUND = '#0b0b0d';

const aspectGap = (width: number, height: number, canvas: Canvas) => Math.abs(width / height - canvas.w / canvas.h) / (canvas.w / canvas.h);

export function paintingFits({ width, height }: { width: number; height: number }, filters: ArtFilters, canvas: Canvas): boolean {
  if (!(width > 0) || !(height > 0) || Math.min(width, height) < filters.minShortSide) return false;
  if (filters.orientation === 'portrait' && height <= width) return false;
  if (filters.orientation === 'landscape' && width <= height) return false;
  return filters.aspectTolerance === undefined || aspectGap(width, height, canvas) <= filters.aspectTolerance;
}

export async function composeFit(image: Buffer, fit: ArtFit, canvas: Canvas): Promise<{ data: Buffer; contentType: string } | null> {
  if (fit === 'cover') return null;
  const sharp = (await import('sharp')).default;
  const meta = await sharp(image).metadata();
  if (!meta.width || !meta.height || aspectGap(meta.width, meta.height, canvas) <= SAME_SHAPE) return null;
  const painting = await sharp(image).rotate().resize({ width: canvas.w, height: canvas.h, fit: 'inside', withoutEnlargement: false }).toBuffer();
  const base = fit === 'matte'
    ? sharp(image).rotate().resize({ width: canvas.w, height: canvas.h, fit: 'cover' }).blur(40).modulate({ brightness: MATTE_BRIGHTNESS })
    : sharp({ create: { width: canvas.w, height: canvas.h, channels: 3, background: CONTAIN_BACKGROUND } });
  const data = await base.composite([{ input: painting, gravity: 'centre' }]).jpeg({ quality: 85 }).toBuffer();
  return { data, contentType: 'image/jpeg' };
}

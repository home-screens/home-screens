import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { composeFit, paintingFits } from '../art-fit';

const CANVAS = { w: 1080, h: 1920 };

describe('paintingFits', () => {
  it('applies the smallest side, orientation and shape tolerance', () => {
    const wide = { width: 3000, height: 2000 };
    expect(paintingFits(wide, { minShortSide: 800 }, CANVAS)).toBe(true);
    expect(paintingFits({ width: 3000, height: 700 }, { minShortSide: 800 }, CANVAS)).toBe(false);
    expect(paintingFits(wide, { minShortSide: 100, orientation: 'portrait' }, CANVAS)).toBe(false);
    expect(paintingFits({ width: 1100, height: 1900 }, { minShortSide: 100, aspectTolerance: 0.1 }, CANVAS)).toBe(true);
    expect(paintingFits(wide, { minShortSide: 100, aspectTolerance: 0.5 }, CANVAS)).toBe(false);
    expect(paintingFits({ width: 0, height: 0 }, { minShortSide: 0 }, CANVAS)).toBe(false);
  });
});

describe('composeFit', () => {
  const jpeg = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#2060c0' } }).jpeg().toBuffer();
  const canvas = { w: 108, h: 192 };

  it('leaves cover and screen-shaped paintings alone, and fills the canvas for matte and contain', async () => {
    expect(await composeFit(await jpeg(160, 100), 'cover', canvas)).toBeNull();
    expect(await composeFit(await jpeg(108, 192), 'matte', canvas)).toBeNull();
    for (const fit of ['matte', 'contain'] as const) {
      const out = await composeFit(await jpeg(160, 100), fit, canvas);
      const meta = await sharp(out!.data).metadata();
      expect([meta.width, meta.height]).toEqual([108, 192]);
    }
  });
});

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { composeArtWall } from '../art-frame';
import { rgbOf } from '../art-presentation';

const CANVAS = { w: 540, h: 960 };
const painting = (color = '#2060c0') => sharp({ create: { width: 320, height: 200, channels: 3, background: color } }).jpeg().toBuffer();
const pixel = async (data: Buffer, x: number, y: number) => {
  const { data: raw } = await sharp(data).extract({ left: Math.round(x), top: Math.round(y), width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [raw[0], raw[1], raw[2]];
};
const near = (got: number[], want: readonly number[], by = 26) => got.every((c, i) => Math.abs(c - want[i]) <= by);

describe('composeArtWall', () => {
  it('paints a framed painting on its wall at the screen\'s size: wall, frame, mat and painting where the layout says', async () => {
    const out = (await composeArtWall(await painting(), { fit: 'framed', wall: 'warm-white', mat: 'cream', frame: 'black', texture: true }, CANVAS))!;
    const meta = await sharp(out.data).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([540, 960, 'jpeg']);
    const { opening, frame, moulding } = out.layout;
    expect(near(await pixel(out.data, 6, 950), rgbOf('#d9d3c6'), 40)).toBe(true);
    expect(near(await pixel(out.data, frame!.x + moulding / 2, frame!.y + frame!.h / 2), rgbOf('#1b1b1d'))).toBe(true);
    expect(near(await pixel(out.data, frame!.x + moulding + 12, frame!.y + frame!.h / 2), rgbOf('#ece6d8'))).toBe(true);
    expect(near(await pixel(out.data, opening.x + opening.w / 2, opening.y + opening.h / 2), rgbOf('#2060c0'))).toBe(true);
  });

  it('fills the screen with the mat, and takes its colour from the painting when asked', async () => {
    const cream = (await composeArtWall(await painting(), { fit: 'mat', wall: 'charcoal', mat: 'cream', frame: 'black', texture: false }, CANVAS))!;
    expect(cream.layout.frame).toBeUndefined();
    expect(near(await pixel(cream.data, 8, 8), rgbOf('#ece6d8'))).toBe(true);

    const toned = (await composeArtWall(await painting('#803020'), { fit: 'mat', wall: 'charcoal', mat: 'painting', frame: 'black', texture: false }, CANVAS))!;
    const [r, g, b] = await pixel(toned.data, 8, 8);
    // A warm, light colour: redder than it is blue, and nowhere near the painting's own darkness.
    expect(r).toBeGreaterThan(b + 10);
    expect(r + g + b).toBeGreaterThan(450);
  });

  it('paints to the layout it is handed, so the label the wall was told about lines up', async () => {
    const first = (await composeArtWall(await painting(), { fit: 'framed', wall: 'charcoal', mat: 'none', frame: 'gold', texture: true }, CANVAS))!;
    const again = (await composeArtWall(await painting(), { fit: 'framed', wall: 'charcoal', mat: 'none', frame: 'gold', texture: true }, CANVAS, first.layout))!;
    expect(again.layout).toBe(first.layout);
    expect(near(await pixel(again.data, first.layout.frame!.x + 3, first.layout.frame!.y + 40), rgbOf('#c9b27a'))).toBe(true);
  });
});

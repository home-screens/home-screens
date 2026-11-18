import { describe, it, expect } from 'vitest';
import { artLayout, cornerLabel, isArtCaption, lightnessOf, matLettering, mutedTone } from '../art-presentation';

const TALL = { w: 1080, h: 1920 };
const WIDE = { w: 1920, h: 1080 };
/** Monet's The Magpie, the painting the mockup was drawn with. */
const MAGPIE = 960 / 651;

describe('artLayout', () => {
  it('hangs a framed painting as large as a tall screen allows, in the exact middle, with the label on the mat', () => {
    // The approved mockup (`.claude/mockups/art-tall-frame.html`).
    const layout = artLayout('framed', MAGPIE, TALL, 'cream');
    expect(layout.opening).toEqual({ x: 154, y: 698, w: 772, h: 524 });
    // 74 of mat and 16 of moulding on every side, 64 of wall beside the frame.
    expect(layout.frame).toEqual({ x: 64, y: 608, w: 952, h: 704 });
    expect(layout.frame!.y + layout.frame!.h / 2).toBe(TALL.h / 2);
    // Lettering sits in the strip of mat under the painting, clear of the moulding at the sides.
    expect(layout.label).toEqual({ style: 'printed', x: 100, y: 1222, w: 880, tone: 'dark', unit: 1, band: 74 });
  });

  it('does the same on a wide screen, where the screen\'s height is the limit', () => {
    // `.claude/mockups/art-wide-frame-strip.html`, variant A.
    const layout = artLayout('framed', 4000 / 2472, WIDE, 'cream');
    expect(layout.opening).toEqual({ x: 326, y: 148, w: 1269, h: 784 });
    // 58 of wall above and below the frame.
    expect(layout.frame).toEqual({ x: 236, y: 58, w: 1449, h: 964 });
    expect(layout.label).toEqual({ style: 'printed', x: 272, y: 932, w: 1377, tone: 'dark', unit: 1, band: 74 });
    expect(artLayout('framed', 4000 / 2472, WIDE, 'charcoal', matLettering('charcoal')).label).toMatchObject({ tone: 'light' });
  });

  it('keeps the frame in the middle with wall around it, whatever the screen and the painting\'s shape', () => {
    for (const canvas of [TALL, WIDE, { w: 1080, h: 1080 }]) {
      for (const aspect of [0.5, 0.6, 960 / 1239, 1, 1.2, MAGPIE, 1.7, 2.06, 2.6]) {
        const { frame, opening } = artLayout('framed', aspect, canvas, 'cream');
        const label = artLayout('framed', aspect, canvas, 'cream').label!;
        expect(Math.abs(frame!.x + frame!.w / 2 - canvas.w / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(frame!.y + frame!.h / 2 - canvas.h / 2)).toBeLessThanOrEqual(1);
        expect(frame!.x).toBeGreaterThanOrEqual(64);
        expect(frame!.y).toBeGreaterThanOrEqual(58);
        expect(opening.w / opening.h).toBeCloseTo(aspect, 1);
        // The mat is the same on every side.
        expect([opening.x - frame!.x, opening.y - frame!.y, frame!.y + frame!.h - (opening.y + opening.h)]).toEqual([90, 90, 90]);
        // The lettering is on the mat: under the painting, above the moulding, between the frame's sides.
        expect(label.y).toBe(opening.y + opening.h);
        expect(label.y + label.band!).toBe(frame!.y + frame!.h - 16);
        expect(label.x).toBeGreaterThan(frame!.x + 16);
        expect(label.x + label.w).toBeLessThan(frame!.x + frame!.w - 16);
      }
    }
  });

  it('gives a frame with no mat a card on the wall under it where there is wall to spare, and no label where there is none', () => {
    const layout = artLayout('framed', MAGPIE, TALL, 'none');
    // The frame sits straight on the painting.
    expect(layout).toMatchObject({ mat: 0, bevel: 0, opening: { x: 80, y: 648, w: 920, h: 624 }, frame: { x: 64, y: 632, w: 952, h: 656 } });
    // The card's right edge sits under the frame's, 70 below it.
    expect(layout.label).toEqual({ style: 'placard', x: 686, y: 1358, w: 330, tone: 'dark', unit: 1 });
    // A tall painting still leaves room for the card on a tall screen, with a margin under it.
    const tall = artLayout('framed', 960 / 1239, TALL, 'none');
    expect(tall.label).toMatchObject({ style: 'placard', y: tall.frame!.y + tall.frame!.h + 70 });
    expect(tall.label!.y + 170 + 64).toBeLessThanOrEqual(TALL.h);
    // A very tall one fills the height, and so does nearly any painting on a wide screen.
    expect(artLayout('framed', 0.6, TALL, 'none').label).toBeNull();
    const wide = artLayout('framed', 4000 / 2472, WIDE, 'none');
    expect(wide.label).toBeNull();
    expect(wide.opening).toMatchObject({ w: 1508, h: 932 });
  });

  it('gives a mat that fills the screen a wider painting and larger lettering under it', () => {
    const layout = artLayout('mat', MAGPIE, TALL, 'charcoal', matLettering('charcoal'));
    expect(layout.opening).toEqual({ x: 92, y: 560, w: 896, h: 608 });
    expect(layout.frame).toBeUndefined();
    expect(layout.label).toMatchObject({ style: 'printed', tone: 'light', x: 92, y: 1222, w: 896 });
    expect(layout.label!.band).toBeUndefined();
    expect(matLettering('cream')).toBe('dark');
    expect(matLettering('painting')).toBe('dark');
    const wide = artLayout('mat', MAGPIE, WIDE, 'cream');
    expect(Math.abs(wide.opening.x + wide.opening.w / 2 - WIDE.w / 2)).toBeLessThanOrEqual(1);
  });

  it('scales everything with the screen', () => {
    const big = artLayout('framed', MAGPIE, { w: 2160, h: 3840 }, 'cream');
    expect(big.unit).toBe(2);
    expect(big.opening).toEqual({ x: 308, y: 1397, w: 1544, h: 1047 });
    expect(big.label).toMatchObject({ w: 1760, band: 148 });
  });
});

describe('colours and captions', () => {
  it('takes a soft, light colour from a painting, however dark it is', () => {
    expect(mutedTone([171, 167, 146])).toBe('#c9c4b2');
    expect(lightnessOf(mutedTone([20, 20, 30]))).toBeGreaterThanOrEqual(0.6);
  });

  it('places a corner card inside the screen and tells a caption from something else', () => {
    const corner = cornerLabel(TALL);
    expect(corner.x + corner.w).toBeLessThan(TALL.w);
    expect(corner.y).toBeLessThan(TALL.h);
    expect(isArtCaption({ id: 'Q1', file: 'a.jpg', title: 'A', label: 'brief', place: corner })).toBe(true);
    expect(isArtCaption({ id: 'Q1', title: 'A', label: 'sometimes', place: corner })).toBe(false);
    expect(isArtCaption(null)).toBe(false);
  });
});

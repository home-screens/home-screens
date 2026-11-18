import { describe, it, expect } from 'vitest';
import { artLayout, cornerLabel, isArtCaption, lightnessOf, matLettering, mutedTone } from '../art-presentation';

const TALL = { w: 1080, h: 1920 };
const WIDE = { w: 1920, h: 1080 };
/** Monet's The Magpie, the painting the mockup was drawn with. */
const MAGPIE = 960 / 651;

describe('artLayout', () => {
  it('hangs a framed painting where the approved mockup has it on a 1080x1920 wall', () => {
    const layout = artLayout('framed', MAGPIE, TALL, 'cream');
    expect(layout.opening).toEqual({ x: 190, y: 588, w: 700, h: 475 });
    // 74 of mat and 16 of moulding on every side.
    expect(layout.frame).toEqual({ x: 100, y: 498, w: 880, h: 655 });
    // The card's right edge sits under the frame's, 70 below it.
    expect(layout.label).toMatchObject({ style: 'placard', x: 650, y: 1223, w: 330 });
  });

  it('puts the frame straight on the painting when there is no mat', () => {
    const layout = artLayout('framed', MAGPIE, TALL, 'none');
    expect(layout).toMatchObject({ mat: 0, bevel: 0, frame: { x: 174, y: 572, w: 732, h: 507 } });
  });

  it('gives a mat that fills the screen a wider painting and lettering under it', () => {
    const layout = artLayout('mat', MAGPIE, TALL, 'charcoal', matLettering('charcoal'));
    expect(layout.opening).toEqual({ x: 92, y: 560, w: 896, h: 608 });
    expect(layout.frame).toBeUndefined();
    expect(layout.label).toMatchObject({ style: 'printed', tone: 'light', x: 92, y: 1222, w: 896 });
    expect(matLettering('cream')).toBe('dark');
    expect(matLettering('painting')).toBe('dark');
  });

  it('keeps a tall painting and its card on the screen, with room underneath', () => {
    const layout = artLayout('framed', 960 / 1239, TALL, 'cream');
    const { frame } = layout;
    const label = layout.label!;
    expect(frame!.y).toBeGreaterThan(0);
    expect(frame!.y + frame!.h).toBeLessThan(label.y);
    expect(label.y + 150).toBeLessThan(TALL.h);
  });

  it('sizes the frame by a wide screen\'s height, with an even mat and the label printed on it under the painting', () => {
    // The approved mockup's painting (`.claude/mockups/art-wide-frame-strip.html`, variant A).
    const layout = artLayout('framed', 4000 / 2472, WIDE, 'cream');
    expect(layout.opening).toEqual({ x: 326, y: 138, w: 1269, h: 784 });
    // 16 of moulding and 74 of mat on every side, 48 of wall above the frame and 68 below.
    expect(layout.frame).toEqual({ x: 236, y: 48, w: 1449, h: 964 });
    // Lettering sits in the strip of mat under the painting, clear of the moulding at the sides.
    expect(layout.label).toEqual({ style: 'printed', x: 272, y: 922, w: 1377, tone: 'dark', unit: 1, band: 74 });
    expect(artLayout('framed', 4000 / 2472, WIDE, 'charcoal', matLettering('charcoal')).label).toMatchObject({ tone: 'light' });
  });

  it('keeps the frame in the middle of a wide screen with wall around it, whatever the painting\'s shape', () => {
    for (const aspect of [0.6, 960 / 1239, 1, 1.2, MAGPIE, 1.7, 2.06, 2.6]) {
      const { frame, opening } = artLayout('framed', aspect, WIDE, 'cream');
      const label = artLayout('framed', aspect, WIDE, 'cream').label!;
      expect(Math.abs(frame!.x + frame!.w / 2 - WIDE.w / 2)).toBeLessThanOrEqual(1);
      expect(frame!.x).toBeGreaterThanOrEqual(64);
      expect(frame!.y).toBeGreaterThanOrEqual(48);
      expect(frame!.y + frame!.h).toBeLessThanOrEqual(WIDE.h - 68);
      expect(opening.w / opening.h).toBeCloseTo(aspect, 1);
      // The mat is the same on every side.
      expect(opening.y - frame!.y).toBe(90);
      expect(frame!.y + frame!.h - (opening.y + opening.h)).toBe(90);
      // The lettering is on the mat: under the painting, above the moulding, between the frame's sides.
      expect(label.y).toBe(opening.y + opening.h);
      expect(label.y + label.band!).toBe(frame!.y + frame!.h - 16);
      expect(label.x).toBeGreaterThan(frame!.x + 16);
      expect(label.x + label.w).toBeLessThan(frame!.x + frame!.w - 16);
    }
  });

  it('has no label where there is no mat to print on, on a wide screen only', () => {
    const bare = artLayout('framed', 4000 / 2472, WIDE, 'none');
    expect(bare.label).toBeNull();
    expect(bare).toMatchObject({ mat: 0, bevel: 0, opening: { w: 1508, h: 932 } });
    // A tall screen keeps its card, and a mat that fills a wide screen keeps its lettering.
    expect(artLayout('framed', MAGPIE, TALL, 'none').label).toMatchObject({ style: 'placard' });
    const matted = artLayout('mat', MAGPIE, WIDE, 'cream');
    expect(matted.label).toMatchObject({ style: 'printed' });
    expect(matted.label!.band).toBeUndefined();
    expect(Math.abs(matted.opening.x + matted.opening.w / 2 - WIDE.w / 2)).toBeLessThanOrEqual(1);
  });

  it('scales everything with the screen', () => {
    const big = artLayout('framed', MAGPIE, { w: 2160, h: 3840 }, 'cream');
    expect(big.unit).toBe(2);
    expect(big.opening).toEqual({ x: 380, y: 1177, w: 1400, h: 949 });
    expect(big.label!.w).toBe(660);
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

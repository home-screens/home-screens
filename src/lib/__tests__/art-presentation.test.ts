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
    const { frame, label } = layout;
    expect(frame!.y).toBeGreaterThan(0);
    expect(frame!.y + frame!.h).toBeLessThan(label.y);
    expect(label.y + 150).toBeLessThan(TALL.h);
  });

  it('keeps the frame in the middle of a wide screen, whatever the painting\'s shape', () => {
    for (const aspect of [0.6, 960 / 1239, 1, 1.2, MAGPIE, 1.7, 2.06, 2.6]) {
      const { frame, label, opening } = artLayout('framed', aspect, WIDE, 'cream');
      expect(Math.abs(frame!.x + frame!.w / 2 - WIDE.w / 2)).toBeLessThanOrEqual(1);
      expect(frame!.y).toBeGreaterThanOrEqual(139);
      expect(opening.w / opening.h).toBeCloseTo(aspect, 1);
      // The card is on the screen with a margin, clear of the frame: beside it, or under its right edge.
      expect(label.x + label.w).toBeLessThanOrEqual(WIDE.w - 60);
      expect(label.y + 170).toBeLessThanOrEqual(WIDE.h - 60);
      const beside = label.x >= frame!.x + frame!.w;
      const under = label.y >= frame!.y + frame!.h;
      expect(beside || under).toBe(true);
      if (under) expect(label.x + label.w).toBe(frame!.x + frame!.w);
    }
  });

  it('puts the card beside a squarer painting and under a wide, short one, taking whichever leaves the painting larger', () => {
    const magpie = artLayout('framed', MAGPIE, WIDE, 'cream');
    expect(magpie.opening).toEqual({ x: 554, y: 230, w: 812, h: 551 });
    expect(magpie.label).toMatchObject({ x: 1526, y: 721 });
    const panorama = artLayout('framed', 2.06, WIDE, 'cream');
    expect(panorama.opening).toMatchObject({ w: 939, h: 456 });
    expect(panorama.label.y).toBe(panorama.frame!.y + panorama.frame!.h + 70);
    // A mat that fills the screen was always in the middle: its lettering sits under the painting.
    const matted = artLayout('mat', MAGPIE, WIDE, 'cream');
    expect(Math.abs(matted.opening.x + matted.opening.w / 2 - WIDE.w / 2)).toBeLessThanOrEqual(1);
  });

  it('scales everything with the screen', () => {
    const big = artLayout('framed', MAGPIE, { w: 2160, h: 3840 }, 'cream');
    expect(big.unit).toBe(2);
    expect(big.opening).toEqual({ x: 380, y: 1177, w: 1400, h: 949 });
    expect(big.label.w).toBe(660);
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

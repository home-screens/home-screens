import { describe, it, expect } from 'vitest';
import { TARGET_IMAGE_WIDTH, upscaleImageUrl } from '../image-upscale';

/**
 * The BBC rules were checked against all 318 image URLs their nine feeds
 * carried on 2026-08-29: three path shapes, every one of them re-rendered at
 * 1248px. 1248 is the rung BBC's own article pages request, not a size we
 * invented for them.
 */
describe('upscaleImageUrl', () => {
  const BASE = 'cpsprodpb/e283/live/cf42fda0-a3b8-11f1-b13c-0d78069132fa.jpg';

  it('raises the width segment on ichef /ace/standard/ URLs', () => {
    expect(upscaleImageUrl(`https://ichef.bbci.co.uk/ace/standard/240/${BASE}`))
      .toBe(`https://ichef.bbci.co.uk/ace/standard/1248/${BASE}`);
  });

  it('raises the width on the World Service /ace/ws/ variant', () => {
    expect(upscaleImageUrl(`https://ichef.bbci.co.uk/ace/ws/240/${BASE}`))
      .toBe(`https://ichef.bbci.co.uk/ace/ws/1248/${BASE}`);
  });

  it('scales the /images/ic/<w>x<h>/ shape, keeping its aspect ratio', () => {
    expect(upscaleImageUrl(`https://ichef.bbci.co.uk/images/ic/240x135/${BASE}`))
      .toBe(`https://ichef.bbci.co.uk/images/ic/1248x702/${BASE}`);
  });

  it('picks the smallest rung on the publisher ladder that clears the target', () => {
    const out = upscaleImageUrl(`https://ichef.bbci.co.uk/ace/standard/240/${BASE}`);
    const width = Number(out!.match(/\/ace\/standard\/(\d+)\//)![1]);
    expect(width).toBeGreaterThanOrEqual(TARGET_IMAGE_WIDTH);
    // 976 is the rung below; asking for more than 1248 would be wasted bytes.
    expect(width).toBe(1248);
  });

  it('never shrinks a URL that already asks for enough', () => {
    expect(upscaleImageUrl(`https://ichef.bbci.co.uk/ace/standard/1600/${BASE}`)).toBeNull();
    expect(upscaleImageUrl(`https://ichef.bbci.co.uk/images/ic/1600x900/${BASE}`)).toBeNull();
  });

  it('leaves publishers with no rule alone', () => {
    expect(upscaleImageUrl('https://static01.nyt.com/images/2026/a.jpg')).toBeNull();
    expect(upscaleImageUrl('https://s.abcnews.com/images/International/x_384.jpg')).toBeNull();
    // A lookalike host must not match the bbci rule.
    expect(upscaleImageUrl(`https://ichef.bbci.co.uk.evil.example/ace/standard/240/${BASE}`)).toBeNull();
  });

  it('is null-safe for missing and unparseable URLs', () => {
    expect(upscaleImageUrl(null)).toBeNull();
    expect(upscaleImageUrl('')).toBeNull();
    expect(upscaleImageUrl('not a url')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import {
  DISPLAY_SIZE_STEPS,
  canResizePicture,
  displaySizeBox,
  displaySizedUrl,
  tileThumbnailUrl,
} from '@/lib/media-paths';

const SERVE = '/api/backgrounds/serve?file=';

describe('canResizePicture', () => {
  it('resizes raster formats and leaves gif and svg whole', () => {
    expect(canResizePicture('a.jpg')).toBe(true);
    expect(canResizePicture('nature/a.PNG')).toBe(true);
    expect(canResizePicture('a.webp')).toBe(true);
    expect(canResizePicture('a.gif')).toBe(false);
    expect(canResizePicture('a.svg')).toBe(false);
    expect(canResizePicture('clip.mp4')).toBe(false);
  });
});

describe('tileThumbnailUrl', () => {
  it('asks for the tile copy of a library picture', () => {
    expect(tileThumbnailUrl(`${SERVE}beach.jpg`)).toBe(`${SERVE}beach.jpg&w=480`);
  });

  it('leaves everything else alone', () => {
    expect(tileThumbnailUrl('/backgrounds/starter.jpg')).toBe('/backgrounds/starter.jpg');
    expect(tileThumbnailUrl(`${SERVE}clip.mp4&mt=abc`)).toBe(`${SERVE}clip.mp4&mt=abc`);
    expect(tileThumbnailUrl(`${SERVE}beach.jpg&w=320`)).toBe(`${SERVE}beach.jpg&w=320`);
  });
});

describe('displaySizedUrl', () => {
  it('rounds each side of the box up to the next step', () => {
    expect(displaySizedUrl(`${SERVE}beach.jpg`, { w: 1080, h: 1920 })).toBe(`${SERVE}beach.jpg&w=1080&h=1920`);
    expect(displaySizedUrl(`${SERVE}beach.jpg`, { w: 500, h: 400 })).toBe(`${SERVE}beach.jpg&w=720&h=480`);
    expect(displaySizedUrl(`${SERVE}a%2Fb.jpg`, { w: 1, h: 9000 })).toBe(`${SERVE}a%2Fb.jpg&w=240&h=3840`);
  });

  it('never asks for a size the server refuses', () => {
    for (const w of [1, 239, 241, 1079, 1081, 5000]) {
      const url = displaySizedUrl(`${SERVE}beach.jpg`, { w, h: w })!;
      const params = new URLSearchParams(url.split('?')[1]);
      expect(displaySizeBox(params.get('w'), params.get('h'))).not.toBeNull();
    }
  });

  it('leaves static paths, cloud photos, videos, gif, svg and unknown boxes alone', () => {
    const box = { w: 1080, h: 1920 };
    expect(displaySizedUrl('/backgrounds/starter.jpg', box)).toBe('/backgrounds/starter.jpg');
    expect(displaySizedUrl('/api/immich/serve?assetId=x&size=preview', box)).toBe('/api/immich/serve?assetId=x&size=preview');
    expect(displaySizedUrl('https://cvws.icloud-content.com/p.jpg', box)).toBe('https://cvws.icloud-content.com/p.jpg');
    expect(displaySizedUrl(`${SERVE}clip.mp4&mt=tok`, box)).toBe(`${SERVE}clip.mp4&mt=tok`);
    expect(displaySizedUrl(`${SERVE}party.gif`, box)).toBe(`${SERVE}party.gif`);
    expect(displaySizedUrl(`${SERVE}art.svg`, box)).toBe(`${SERVE}art.svg`);
    expect(displaySizedUrl(`${SERVE}beach.jpg`, undefined)).toBe(`${SERVE}beach.jpg`);
    expect(displaySizedUrl(`${SERVE}beach.jpg`, { w: 0, h: 100 })).toBe(`${SERVE}beach.jpg`);
    expect(displaySizedUrl(undefined, box)).toBeUndefined();
  });
});

describe('displaySizeBox', () => {
  it('accepts only listed steps on both sides', () => {
    expect(displaySizeBox('1080', '1920')).toEqual({ w: 1080, h: 1920 });
    expect(displaySizeBox('1000', '1920')).toBeNull();
    expect(displaySizeBox('1080', null)).toBeNull();
    expect(displaySizeBox('abc', '1920')).toBeNull();
    expect(DISPLAY_SIZE_STEPS).toContain(3840);
  });
});

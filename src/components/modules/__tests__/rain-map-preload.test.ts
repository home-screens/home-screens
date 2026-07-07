import { describe, it, expect } from 'vitest';
import { createTilePreloader, type PreloadImage } from '../rain-map-preload';

/** Controllable stand-in for `new Image()` — tests fire load/error by hand. */
class FakeImage implements PreloadImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
}

function makePreloader() {
  const images: FakeImage[] = [];
  const preloader = createTilePreloader(() => {
    const img = new FakeImage();
    images.push(img);
    return img;
  });
  return { preloader, images };
}

const fireLoad = (img: FakeImage) => (img.onload as () => void)();
const fireError = (img: FakeImage) => (img.onerror as () => void)();

describe('createTilePreloader', () => {
  it('skips URLs that already loaded and resolves immediately', async () => {
    const { preloader, images } = makePreloader();

    const first = preloader.preload(['https://t/a.png']);
    expect(images).toHaveLength(1);
    fireLoad(images[0]);
    await first;

    await preloader.preload(['https://t/a.png']);
    expect(images).toHaveLength(1); // no second request
  });

  it('does NOT cache failed URLs, so the next pass retries them', async () => {
    const { preloader, images } = makePreloader();

    const first = preloader.preload(['https://t/a.png']);
    fireError(images[0]);
    await first; // settles despite the failure

    preloader.preload(['https://t/a.png']);
    expect(images).toHaveLength(2); // retried, not poisoned forever
  });

  it('resolves only when every requested tile has settled (mixed load/error)', async () => {
    const { preloader, images } = makePreloader();
    let settled = false;

    const p = preloader.preload(['https://t/a.png', 'https://t/b.png']).then(() => {
      settled = true;
    });
    fireLoad(images[0]);
    await Promise.resolve();
    expect(settled).toBe(false); // b.png still pending
    fireError(images[1]);
    await p;
    expect(settled).toBe(true);
  });

  it('prune drops cached URLs outside the valid set and keeps the rest', async () => {
    const { preloader, images } = makePreloader();

    const p = preloader.preload(['https://t/old.png', 'https://t/kept.png']);
    images.forEach(fireLoad);
    await p;

    preloader.prune(new Set(['https://t/kept.png']));

    preloader.preload(['https://t/old.png', 'https://t/kept.png']);
    const srcs = images.slice(2).map((img) => img.src);
    expect(srcs).toEqual(['https://t/old.png']); // pruned URL re-requested, kept URL still cached
  });

  it('ignores empty URLs without creating a request', async () => {
    const { preloader, images } = makePreloader();
    await preloader.preload(['', '']);
    expect(images).toHaveLength(0);
  });
});

'use client';

import { useEffect, useState } from 'react';
import { CLOUD_PALETTES, type CloudPalette } from './sky-layer';

/**
 * The cloud sprites the living sky drifts across the screen.
 *
 * `scripts/generate/sky-sprites.mjs` renders three grey-plus-alpha PNGs under
 * public/sky, each two screens wide so no silhouette repeats on one wall: the grey is how lit each pixel is, the alpha its coverage. A
 * sky tints them once, here, between its palette's shade and light colours,
 * and keeps the result as a blob URL for the rest of the session. That is
 * one pass of pixel math per palette on the Pi and then only compositing:
 * no filter, no canvas loop, no per-frame work.
 */
export type CloudLayer = 'far' | 'mid' | 'near' | 'veil' | 'fog';
export const CLOUD_LAYERS: readonly CloudLayer[] = ['far', 'mid', 'near', 'veil', 'fog'];
/** The sprites the sky drifts sideways as cloud layers; `fog` is the mist's own sheet, drawn by `Mist`. */
export const DRIFT_LAYERS: readonly Exclude<CloudLayer, 'fog'>[] = ['far', 'mid', 'near', 'veil'];

/** Sprite tile size in CSS px, matching the generator. */
export const CLOUD_TILE_W = 2160;
export const CLOUD_TILE_H = 640;

export type CloudSprites = Record<CloudLayer, string>;

const tinted = new Map<CloudPalette, Promise<CloudSprites>>();
const greyCache = new Map<CloudLayer, Promise<ImageData>>();

function loadGrey(layer: CloudLayer): Promise<ImageData> {
  let p = greyCache.get(layer);
  if (!p) {
    p = new Promise<ImageData>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        if (!ctx) return reject(new Error('no 2d context'));
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, cv.width, cv.height));
      };
      img.onerror = () => reject(new Error(`cloud sprite ${layer} failed to load`));
      img.src = layer === 'fog' ? '/sky/fog.png' : `/sky/clouds-${layer}.png`;
    });
    // A load that failed (the hub was unreachable for a moment) is forgotten,
    // so the next palette asks for the picture again instead of reusing the
    // rejection for the rest of the session.
    p.catch(() => greyCache.delete(layer));
    greyCache.set(layer, p);
  }
  return p;
}

function tintLayer(grey: ImageData, palette: CloudPalette): Promise<string> {
  const { light, shade } = CLOUD_PALETTES[palette];
  const cv = document.createElement('canvas');
  cv.width = grey.width;
  cv.height = grey.height;
  const ctx = cv.getContext('2d')!;
  const out = ctx.createImageData(grey.width, grey.height);
  const src = grey.data;
  const dst = out.data;
  const dr = light[0] - shade[0];
  const dg = light[1] - shade[1];
  const db = light[2] - shade[2];
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    if (a === 0) continue;
    // A grey PNG decodes with the grey in every colour channel.
    const lit = src[i] / 255;
    dst[i] = shade[0] + dr * lit;
    dst[i + 1] = shade[1] + dg * lit;
    dst[i + 2] = shade[2] + db * lit;
    dst[i + 3] = a;
  }
  ctx.putImageData(out, 0, 0);
  return new Promise((resolve, reject) => {
    cv.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

/** The three sprites tinted for a palette, made once per session. */
export function cloudSprites(palette: CloudPalette): Promise<CloudSprites> {
  let p = tinted.get(palette);
  if (!p) {
    p = Promise.all(CLOUD_LAYERS.map((layer) => loadGrey(layer).then((g) => tintLayer(g, palette))))
      .then((urls) => Object.fromEntries(CLOUD_LAYERS.map((layer, i) => [layer, urls[i]])) as CloudSprites);
    // A failed load is retried on the next request rather than cached.
    p.catch(() => tinted.delete(palette));
    tinted.set(palette, p);
  }
  return p;
}

/** The tinted sprites for a palette, or null until they are ready. */
export function useCloudSprites(palette: CloudPalette | null): CloudSprites | null {
  const [sprites, setSprites] = useState<{ palette: CloudPalette; urls: CloudSprites } | null>(null);
  useEffect(() => {
    if (!palette) return;
    let live = true;
    cloudSprites(palette).then((urls) => { if (live) setSprites({ palette, urls }); }, () => { /* the sky shows without clouds */ });
    return () => { live = false; };
  }, [palette]);
  return sprites && sprites.palette === palette ? sprites.urls : null;
}

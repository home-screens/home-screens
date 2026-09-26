'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaListItem } from '@/types/config';
import { useAuthImageState, type AuthImageState } from '@/components/display/useAuthImage';
import { displaySizedUrl, type PictureBox } from '@/lib/media-paths';

/**
 * How long a slide whose image failed to load keeps the previous slide on
 * screen before the rotation is asked to move on. Long enough that a list of
 * dead URLs does not turn into a hot loop of fetches; short enough that one
 * bad photo costs a moment, not a whole interval.
 */
export const FAILED_SLIDE_SKIP_MS = 2_000;

export type LayerIndex = 0 | 1;

/**
 * For a slide layer's `onLoad`: report the layer ready once its picture is
 * decoded, not merely downloaded. `onLoad` fires before the decode, so on a
 * Pi the decode of the incoming photo landed in the first frames of the fade
 * and stuttered it; waiting for `decode()` starts the fade on a picture that
 * is ready to paint. A layer whose picture changed while decoding stays
 * quiet: the new picture's own load reports it.
 */
export function readyWhenDecoded(img: HTMLImageElement, onReady: (() => void) | undefined): void {
  if (!onReady) return;
  if (typeof img.decode !== 'function') {
    onReady();
    return;
  }
  const src = img.src;
  img.decode()
    .catch(() => { /* a picture that cannot decode fires onError instead */ })
    .then(() => {
      if (img.src === src) onReady();
    });
}

/**
 * The picture for one slide layer: a library photo at a size that covers
 * `box` rather than the camera original. A new slide never shows the previous
 * slide's picture while it loads (the layer stays hidden until its own image
 * is ready), but a new size of the same photo does keep the old size up: in
 * the editor, dragging a card's corner past a size step would otherwise blank
 * the photo until the new copy arrived.
 */
export function useSlideImage(src: string, box: PictureBox | undefined): AuthImageState {
  const shownFor = useRef<string | null>(null);
  const state = useAuthImageState(displaySizedUrl(src, box), { holdPrevious: shownFor.current === src });
  if (state.status === 'ready') shownFor.current = src;
  return state;
}

export interface CrossfadeLayers<T> {
  /** What each of the two layers is showing (or loading). */
  sources: [T | null, T | null];
  /** The layer on top. */
  activeLayer: LayerIndex;
  /** A layer's image is decoded and painted; called from `<img onLoad>`. */
  layerReady: (layer: LayerIndex) => void;
  /** A layer's image could not be fetched or decoded. */
  layerFailed: (layer: LayerIndex) => void;
}

/**
 * The two-layer crossfade behind both photo modules. The rotation index says
 * which item is due; this decides when the swap actually happens.
 *
 * The incoming item is loaded into the hidden layer and stays there until
 * that layer reports its image ready. Only then does `activeLayer` flip, so
 * the outgoing photo is on screen for the whole download and the fade runs
 * between two painted images. Flipping the moment the index changed (the old
 * behavior) faded the outgoing photo out over a layer that had nothing to
 * show yet: every slow, uncached cloud photo produced a blank frame, and a
 * failed download left it blank until the next slide.
 *
 * Videos still cut immediately: VideoLayer owns its own loading and stall
 * handling, and a crossfade would run two decoders at once, which Pi hardware
 * cannot afford. A failed image asks the rotation to `advance` after a short
 * delay so a dead photo is skipped rather than shown as a gap.
 */
export function useCrossfadeLayers<T extends MediaListItem>(
  item: T | null,
  index: number,
  advance: () => void,
): CrossfadeLayers<T> {
  const [activeLayer, setActiveLayer] = useState<LayerIndex>(0);
  const [sources, setSources] = useState<[T | null, T | null]>([null, null]);
  const sourcesRef = useRef<[T | null, T | null]>([null, null]);
  // Readiness belongs to the image currently mounted in each layer. Reusing
  // an unchanged src does not fire onLoad again (notably with two photos).
  const readyRef = useRef<[boolean, boolean]>([false, false]);
  const activeLayerRef = useRef<LayerIndex>(0);
  const prevIndexRef = useRef(index);
  // The layer holding the item that is due next, waiting on its image.
  const pendingLayerRef = useRef<LayerIndex | null>(null);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  const clearSkip = () => {
    if (skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
      skipTimerRef.current = null;
    }
  };

  const flipTo = useCallback((layer: LayerIndex) => {
    pendingLayerRef.current = null;
    activeLayerRef.current = layer;
    setActiveLayer(layer);
  }, []);

  useEffect(() => {
    if (!item) return;
    clearSkip();

    const updateSources = (next: [T | null, T | null]) => {
      for (const layer of [0, 1] as const) {
        const prev = sourcesRef.current[layer];
        if (prev?.url !== next[layer]?.url || prev?.type !== next[layer]?.type) {
          readyRef.current[layer] = false;
        }
      }
      sourcesRef.current = next;
      setSources(next);
    };

    if (prevIndexRef.current !== index) {
      prevIndexRef.current = index;
      const nextLayer: LayerIndex = activeLayerRef.current === 0 ? 1 : 0;
      const updated: [T | null, T | null] = [...sourcesRef.current];
      updated[nextLayer] = item;
      updateSources(updated);
      if (item.type === 'video' || readyRef.current[nextLayer]) {
        flipTo(nextLayer);
      } else {
        pendingLayerRef.current = nextLayer;
      }
    } else {
      // Initial load, or the batch changed under the same index: both layers
      // carry the slide, and the active one shows it as soon as it loads.
      pendingLayerRef.current = null;
      updateSources([item, item]);
    }
  }, [item, index, flipTo]);

  useEffect(() => () => clearSkip(), []);

  const layerReady = useCallback((layer: LayerIndex) => {
    readyRef.current[layer] = sourcesRef.current[layer]?.type === 'image';
    if (pendingLayerRef.current !== layer) return;
    clearSkip();
    flipTo(layer);
  }, [flipTo]);

  const layerFailed = useCallback((layer: LayerIndex) => {
    readyRef.current[layer] = false;
    // Only a layer that is (or is about to be) on screen matters; a stale
    // failure on the hidden outgoing layer changes nothing.
    if (pendingLayerRef.current !== layer && activeLayerRef.current !== layer) return;
    if (pendingLayerRef.current === layer) pendingLayerRef.current = null;
    if (skipTimerRef.current) return;
    skipTimerRef.current = setTimeout(() => {
      skipTimerRef.current = null;
      advanceRef.current();
    }, FAILED_SLIDE_SKIP_MS);
  }, []);

  return { sources, activeLayer, layerReady, layerFailed };
}

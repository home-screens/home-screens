'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuthImageState } from './useAuthImage';
import { FAILED_SLIDE_SKIP_MS, readyWhenDecoded } from '@/components/modules/shared/useCrossfadeLayers';

export const CROSSFADE_MS = 500;

type LayerIndex = 0 | 1;

interface Layer {
  src: string;
  /** Tries so far for this src; a bump remounts the img so the picture is asked for again. */
  attempt: number;
}

type Slots = [Layer | null, Layer | null];

export interface CrossfadeBackgroundProps {
  src?: string;
  alt?: string;
  /** Fetch the picture with the display token (hub-served paths). */
  authenticate?: boolean;
  /** The CSS filter for the picture (background effects). It is applied as it is, with no transition. */
  filter?: string;
}

/**
 * The picture behind a screen, as two fixed layers. A new picture loads
 * hidden in the free layer and is faded in only once it is decoded, so the
 * outgoing picture stays on screen for the whole download and the fade runs
 * between two painted images; after the fade the outgoing layer is emptied,
 * so a wall at rest holds one <img>. The first picture is painted at once
 * (it is in the server HTML at full opacity), and a newer src while one is
 * still loading takes its place rather than queueing behind it.
 *
 * A picture that fails to load is dropped (the solid color shows, never the
 * browser's broken-image glyph) and asked for once more after a short wait,
 * which also covers a hub that was not up yet when the wall booted.
 */
export default function CrossfadeBackground({ src, alt = '', authenticate = false, filter }: CrossfadeBackgroundProps) {
  const [slots, setSlots] = useState<Slots>(() => [src ? { src, attempt: 0 } : null, null]);
  const [active, setActive] = useState<LayerIndex>(0);
  const slotsRef = useRef<Slots>(slots);
  const activeRef = useRef<LayerIndex>(0);
  // The layer loading the newest picture, waiting for its decode before it is shown.
  const pendingRef = useRef<LayerIndex | null>(null);
  const srcRef = useRef(src);
  srcRef.current = src;
  // The src the layers were last arranged for. The mount effect must not
  // re-place a first picture that its own ref already reported as failed.
  const placedRef = useRef(src);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emptyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((next: Slots) => {
    slotsRef.current = next;
    setSlots(next);
  }, []);

  // A picture goes into the active layer when nothing is showing, otherwise
  // into the other one, replacing whatever was loading or fading out there.
  const show = useCallback((layer: Layer) => {
    const current = slotsRef.current;
    if (!current[activeRef.current]) {
      pendingRef.current = null;
      const next: Slots = [null, null];
      next[activeRef.current] = layer;
      commit(next);
      return;
    }
    const other: LayerIndex = activeRef.current === 0 ? 1 : 0;
    if (emptyTimer.current) {
      clearTimeout(emptyTimer.current);
      emptyTimer.current = null;
    }
    const next: Slots = [current[0], current[1]];
    next[other] = layer;
    pendingRef.current = other;
    commit(next);
  }, [commit]);

  useEffect(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    if (placedRef.current === src) return;
    placedRef.current = src;
    const current = slotsRef.current;
    const showing = current[activeRef.current];
    const pending = pendingRef.current === null ? null : current[pendingRef.current];
    if (!src) {
      pendingRef.current = null;
      if (showing || pending) commit([null, null]);
      return;
    }
    if (showing?.src === src) {
      // Back to the picture already on screen while another was loading: drop the loader.
      if (pendingRef.current !== null) {
        const next: Slots = [current[0], current[1]];
        next[pendingRef.current] = null;
        pendingRef.current = null;
        commit(next);
      }
      return;
    }
    show({ src, attempt: 0 });
  }, [src, show, commit]);

  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (emptyTimer.current) clearTimeout(emptyTimer.current);
  }, []);

  const onReady = useCallback((slot: LayerIndex) => {
    if (pendingRef.current !== slot) return;
    pendingRef.current = null;
    const outgoing = activeRef.current;
    activeRef.current = slot;
    setActive(slot);
    if (emptyTimer.current) clearTimeout(emptyTimer.current);
    emptyTimer.current = setTimeout(() => {
      emptyTimer.current = null;
      if (activeRef.current === outgoing || pendingRef.current === outgoing) return;
      const next: Slots = [slotsRef.current[0], slotsRef.current[1]];
      next[outgoing] = null;
      commit(next);
    }, CROSSFADE_MS);
  }, [commit]);

  const onFailed = useCallback((slot: LayerIndex) => {
    const failed = slotsRef.current[slot];
    if (!failed) return;
    if (pendingRef.current === slot) pendingRef.current = null;
    const next: Slots = [slotsRef.current[0], slotsRef.current[1]];
    next[slot] = null;
    commit(next);
    if (failed.attempt >= 1 || retryTimer.current) return;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      if (srcRef.current === failed.src) show({ src: failed.src, attempt: failed.attempt + 1 });
    }, FAILED_SLIDE_SKIP_MS);
  }, [commit, show]);

  return (
    <>
      {slots.map((layer, i) => layer && (
        <MediaLayer
          key={`${i}:${layer.src}#${layer.attempt}`}
          slot={i as LayerIndex}
          layer={layer}
          isActive={active === i}
          isPending={pendingRef.current === i}
          alt={alt}
          authenticate={authenticate}
          filter={filter}
          onReady={onReady}
          onFailed={onFailed}
        />
      ))}
    </>
  );
}

function MediaLayer({ slot, layer, isActive, isPending, alt, authenticate, filter, onReady, onFailed }: {
  slot: LayerIndex;
  layer: Layer;
  isActive: boolean;
  isPending: boolean;
  alt: string;
  authenticate: boolean;
  filter?: string;
  onReady: (slot: LayerIndex) => void;
  onFailed: (slot: LayerIndex) => void;
}) {
  const auth = useAuthImageState(authenticate ? layer.src : undefined, { holdPrevious: false });
  const src = authenticate ? auth.url : layer.src;
  useEffect(() => {
    if (authenticate && auth.status === 'failed') onFailed(slot);
  }, [authenticate, auth.status, slot, onFailed]);

  const ready = useCallback(() => onReady(slot), [onReady, slot]);
  const failed = useCallback(() => onFailed(slot), [onFailed, slot]);
  // A picture that finished before React attached onLoad (cached, or in the
  // server HTML) reports itself from the ref: ready when it has pixels,
  // failed when it is complete without any.
  const probe = useCallback((img: HTMLImageElement | null) => {
    if (!img || !img.complete) return;
    if (img.naturalWidth > 0) readyWhenDecoded(img, ready, failed);
    else failed();
  }, [ready, failed]);

  // The incoming layer sits above the one on screen, which stays at full
  // opacity beneath it until it is emptied, so the fade never shows the solid
  // color through both.
  const style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: isPending ? 0 : 1,
    transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
    zIndex: isPending ? 2 : isActive ? 1 : 0,
    filter,
  };
  if (!src) return null;
  return (
    <img
      ref={probe}
      src={src}
      alt={alt}
      onLoad={(e) => readyWhenDecoded(e.currentTarget, ready, failed)}
      onError={failed}
      style={style}
    />
  );
}

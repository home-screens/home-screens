'use client';

import { useState, useEffect, useRef } from 'react';
import { displayFetch } from '@/lib/display-fetch';

export interface AuthImageOptions {
  /**
   * What to show while a changed `src` is still loading.
   *
   * `true` (default) keeps the previously loaded image on screen until the
   * new one is ready — right for a lone <img> whose caller unmounts or blanks
   * it when this returns nothing, like the screen background, which would
   * otherwise flash black on every rotation.
   *
   * `false` returns undefined instead, so the URL only ever renders while it
   * belongs to the CURRENT src. Right for a crossfade slide layer, which
   * becomes active the moment its src changes and stays mounted-but-hidden
   * while the blob loads: serving the previous blob there made every rotation
   * briefly flash the photo from two advances back.
   */
  holdPrevious?: boolean;
}

/**
 * Fetches an image URL through displayFetch (which injects the display Bearer
 * token) and returns a blob URL that <img> tags can render without auth.
 *
 * For non-API paths (e.g. /backgrounds/foo.jpg from public/) the original URL
 * is returned directly since those don't require authentication.
 */
export function useAuthImage(src: string | undefined, options?: AuthImageOptions): string | undefined {
  const holdPrevious = options?.holdPrevious ?? true;
  const [loaded, setLoaded] = useState<{ forSrc: string; url: string } | null>(null);
  const prevBlobRef = useRef<string | null>(null);

  function revokePrev() {
    if (prevBlobRef.current) {
      URL.revokeObjectURL(prevBlobRef.current);
      prevBlobRef.current = null;
    }
  }

  useEffect(() => {
    if (!src) {
      revokePrev();
      setLoaded(null);
      return;
    }

    // Only intercept API-served images — static paths work without auth
    if (!src.startsWith('/api/')) {
      revokePrev();
      setLoaded(null);
      return;
    }

    let cancelled = false;

    displayFetch(src).then(async (res) => {
      if (cancelled) return;
      if (!res.ok) {
        revokePrev();
        setLoaded(null);
        return;
      }
      const blob = await res.blob();
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      revokePrev();
      setLoaded({ forSrc: src, url });
      prevBlobRef.current = url;
    }).catch(() => {
      if (!cancelled) {
        revokePrev();
        setLoaded(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => { revokePrev(); };
  }, []);

  if (!src) return undefined;
  if (!src.startsWith('/api/')) return src;
  if (loaded?.forSrc === src) return loaded.url;
  return holdPrevious ? loaded?.url : undefined;
}

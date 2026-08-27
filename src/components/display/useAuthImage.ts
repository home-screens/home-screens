'use client';

import { useState, useEffect, useRef } from 'react';
import { displayFetch } from '@/lib/display-fetch';

/**
 * Fetches an image URL through displayFetch (which injects the display Bearer
 * token) and returns a blob URL that <img> tags can render without auth.
 *
 * For non-API paths (e.g. /backgrounds/foo.jpg from public/) the original URL
 * is returned directly since those don't require authentication.
 */
export function useAuthImage(src: string | undefined): string | undefined {
  // The URL only renders while it belongs to the CURRENT src: a src change
  // keeps the old URL in state until the new blob resolves, and serving it
  // in between made an active slide layer briefly flash its PREVIOUS image
  // on every rotation.
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
  return loaded?.forSrc === src ? loaded.url : undefined;
}

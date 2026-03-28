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
  const [blobUrl, setBlobUrl] = useState<string | undefined>(undefined);
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
      setBlobUrl(undefined);
      return;
    }

    // Only intercept API-served images — static paths work without auth
    if (!src.startsWith('/api/')) {
      revokePrev();
      setBlobUrl(src);
      return;
    }

    let cancelled = false;

    displayFetch(src).then(async (res) => {
      if (cancelled) return;
      if (!res.ok) {
        revokePrev();
        setBlobUrl(undefined);
        return;
      }
      const blob = await res.blob();
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      revokePrev();
      setBlobUrl(url);
      prevBlobRef.current = url;
    }).catch(() => {
      if (!cancelled) {
        revokePrev();
        setBlobUrl(undefined);
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

  return blobUrl;
}

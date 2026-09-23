'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useCustomIcons } from '@/hooks/useCustomIcons';

interface CustomIconImageProps {
  id: string;
  className?: string;
  style?: CSSProperties;
  /** Width and height. Defaults to `1em`, the space an emoji takes. */
  size?: number | string;
  /** Shown once the library has loaded without this id, or when its
   *  picture will not load. */
  fallback?: ReactNode;
}

/**
 * One of the household's own pictures. Sized in em by default so it drops
 * into any text row, hero or cell exactly where an emoji sat; the small
 * downward nudge lines its bottom up with an emoji's, which hangs slightly
 * below the text baseline.
 *
 * Until the library has loaded it holds an empty box of the same size, so a
 * row never shifts when the picture arrives. A picture that fails to load
 * (its file gone, a token the hub refused) shows the fallback instead of a
 * broken image; the failure is remembered per URL, so the next catalog
 * refresh, which may hand out a new URL, gets a fresh try.
 */
/** Whether the device asks for reduced motion, kept current as it changes. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export default function CustomIconImage({ id, className, style, size = '1em', fallback = null }: CustomIconImageProps) {
  const { byId, loaded } = useCustomIcons();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const icon = byId.get(id);
  const box: CSSProperties = {
    width: size,
    height: size,
    display: 'inline-block',
    verticalAlign: '-0.125em',
    flexShrink: 0,
    ...style,
  };
  if (icon && failedUrl === icon.url) return <>{fallback}</>;
  if (!icon) {
    if (loaded) return <>{fallback}</>;
    return <span className={className} style={box} aria-hidden="true" />;
  }
  // A moving picture holds still for anyone who asked their device for less motion.
  const src = icon.animated && reducedMotion ? `${icon.url}&still=1` : icon.url;
  return (
    // A plain <img>: these are tiny, already-sized WebPs served from the
    // hub, and next/image's loader would add nothing but a second request.
    <img
      src={src}
      alt={icon.name}
      title={icon.name}
      draggable={false}
      className={className}
      style={{ ...box, objectFit: 'contain' }}
      onError={() => {
        console.warn(`[custom-icons] could not load "${icon.name}" (${icon.id})`);
        setFailedUrl(icon.url);
      }}
    />
  );
}

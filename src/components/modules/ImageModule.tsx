'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslate } from '@/i18n';
import type { ImageConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState } from './ModuleStates';
import { useAuthImageState } from '@/components/display/useAuthImage';
import { displaySizedUrl, type PictureBox } from '@/lib/media-paths';

interface ImageModuleProps {
  config: ImageConfig;
  style: ModuleStyle;
  /** The card's size in canvas pixels (registry `needsBoxSize`). */
  boxSize?: PictureBox;
}

export default function ImageModule({ config, style, boxSize }: ImageModuleProps) {
  const t = useTranslate('modules');
  const { url: src, status } = useAuthImageState(displaySizedUrl(config.src || undefined, boxSize));
  // The address the browser itself could not load (a link that has gone away).
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  // The page arrives with the <img> already in it, so a dead link can fail
  // before React is listening for the error. A picture that finished with
  // nothing to show is asked to decode: only a broken one refuses.
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !src || !img.complete || img.naturalWidth > 0) return;
    let live = true;
    img.decode?.()?.catch(() => { if (live) setBrokenSrc(src); });
    return () => { live = false; };
  }, [src]);

  if (!config.src) {
    return <ModuleEmptyState style={style} type="image" message={t('image.empty')} />;
  }

  // The file was deleted, or the link no longer answers: say so, and only
  // once the load has failed, never while the first one is still out.
  if (status === 'failed' || (src && brokenSrc === src)) {
    return <ModuleEmptyState style={style} message={t('image.unavailable')} />;
  }

  return (
    <ModuleWrapper style={{ ...style, padding: 0 }}>
      {src ? (
        <img
          ref={imgRef}
          src={src}
          alt={config.alt}
          className="w-full h-full"
          onError={() => setBrokenSrc(src)}
          style={{
            objectFit: config.objectFit,
            borderRadius: `${style.borderRadius}px`,
          }}
        />
      ) : null}
    </ModuleWrapper>
  );
}

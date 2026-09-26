'use client';

import { useTranslate } from '@/i18n';
import type { ImageConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState } from './ModuleStates';
import { useAuthImage } from '@/components/display/useAuthImage';
import { displaySizedUrl, type PictureBox } from '@/lib/media-paths';

interface ImageModuleProps {
  config: ImageConfig;
  style: ModuleStyle;
  /** The card's size in canvas pixels (registry `needsBoxSize`). */
  boxSize?: PictureBox;
}

export default function ImageModule({ config, style, boxSize }: ImageModuleProps) {
  const t = useTranslate('modules');
  const src = useAuthImage(displaySizedUrl(config.src || undefined, boxSize));

  if (!config.src) {
    return <ModuleEmptyState style={style} type="image" message={t('image.empty')} />;
  }

  return (
    <ModuleWrapper style={{ ...style, padding: 0 }}>
      {src ? (
        <img
          src={src}
          alt={config.alt}
          className="w-full h-full"
          style={{
            objectFit: config.objectFit,
            borderRadius: `${style.borderRadius}px`,
          }}
        />
      ) : null}
    </ModuleWrapper>
  );
}

'use client';

import { useTranslate } from '@/i18n';
import type { ImageConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState } from './ModuleStates';
import { useAuthImage } from '@/components/display/useAuthImage';

interface ImageModuleProps {
  config: ImageConfig;
  style: ModuleStyle;
}

export default function ImageModule({ config, style }: ImageModuleProps) {
  const t = useTranslate('modules');
  const src = useAuthImage(config.src || undefined);

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

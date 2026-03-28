'use client';

import type { ImageConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { useAuthImage } from '@/components/display/useAuthImage';

interface ImageModuleProps {
  config: ImageConfig;
  style: ModuleStyle;
}

export default function ImageModule({ config, style }: ImageModuleProps) {
  const src = useAuthImage(config.src || undefined);

  return (
    <ModuleWrapper style={{ ...style, padding: 0 }}>
      {config.src ? (
        src ? (
          <img
            src={src}
            alt={config.alt}
            className="w-full h-full"
            style={{
              objectFit: config.objectFit,
              borderRadius: `${style.borderRadius}px`,
            }}
          />
        ) : null
      ) : (
        <div className="flex items-center justify-center h-full opacity-50" style={{ fontSize: '0.875em' }}>
          No image set
        </div>
      )}
    </ModuleWrapper>
  );
}

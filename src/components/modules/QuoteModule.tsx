'use client';

import type { QuoteConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { quoteUrl } from '@/lib/fetch-keys';
import { TEXT_OPACITY } from '@/lib/constants';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';

interface QuoteModuleProps {
  config: QuoteConfig;
  style: ModuleStyle;
}

export default function QuoteModule({ config, style }: QuoteModuleProps) {
  const [data, error] = useFetchData<{ quote: string; author: string }>(quoteUrl(), config.refreshIntervalMs ?? 300000);
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.10);

  if (data === null) {
    return <ModuleLoadingState style={style} message="Loading quote…" error={error} />;
  }

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="flex flex-col items-center justify-center h-full" style={{ fontSize: `${scaledFontSize}px` }}>
        <p className="text-center leading-relaxed italic">
          {data.quote}
        </p>
        {data.author && (
          <p className="mt-2 text-right w-full" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.secondary }}>
            &mdash; {data.author}
          </p>
        )}
      </div>
    </ModuleWrapper>
  );
}

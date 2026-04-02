'use client';

import type { QuoteConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { quoteUrl } from '@/lib/fetch-keys';
import { TEXT_OPACITY, resolveAccent } from '@/lib/constants';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';

interface QuoteModuleProps {
  config: QuoteConfig;
  style: ModuleStyle;
}

export default function QuoteModule({ config, style }: QuoteModuleProps) {
  const [data, error] = useFetchData<{ quote: string; author: string }>(quoteUrl(), config.refreshIntervalMs ?? 300000);
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.10);
  const { accentColor, hasAccent, gradientStyle } = resolveAccent(config);

  if (data === null) {
    return <ModuleLoadingState style={style} message="Loading quote…" error={error} />;
  }

  return (
    <ModuleWrapper style={style}>
      <div
        ref={containerRef}
        className="flex items-center justify-center h-full relative overflow-hidden"
        style={{ fontSize: `${scaledFontSize}px`, ...gradientStyle }}
      >
        {/* Large decorative quotation mark */}
        <span
          className="absolute top-2 left-4 font-serif pointer-events-none select-none"
          style={{ fontSize: '5em', color: hasAccent ? accentColor : 'rgba(255,255,255,0.08)', opacity: hasAccent ? 0.10 : 1 }}
        >
          &ldquo;
        </span>

        <div
          className="flex flex-col px-5 relative"
          style={{ borderLeft: `3px solid ${hasAccent ? `${accentColor}50` : 'rgba(255,255,255,0.15)'}` }}
        >
          <p className="leading-relaxed italic">
            {data.quote}
          </p>
          {data.author && (
            <>
              <div className="w-8 h-px mt-3 mb-2" style={{ backgroundColor: hasAccent ? accentColor : 'rgba(255,255,255,0.15)', opacity: hasAccent ? TEXT_OPACITY.tertiary : 1 }} />
              <p style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.secondary }}>
                &mdash; {data.author}
              </p>
            </>
          )}
        </div>
      </div>
    </ModuleWrapper>
  );
}

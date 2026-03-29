'use client';

import type { DadJokeConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { dadJokeUrl } from '@/lib/fetch-keys';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { TEXT_OPACITY } from '@/lib/constants';

interface DadJokeModuleProps {
  config: DadJokeConfig;
  style: ModuleStyle;
}

export default function DadJokeModule({ config, style }: DadJokeModuleProps) {
  const [data, error] = useFetchData<{ joke: string }>(dadJokeUrl(), config.refreshIntervalMs);
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.10);
  const accentColor = config.accentColor ?? '#000000';

  if (data === null) {
    return <ModuleLoadingState style={style} message="Loading joke…" error={error} />;
  }

  return (
    <ModuleWrapper style={style}>
      <div
        ref={containerRef}
        className="flex flex-col items-center justify-center h-full gap-3"
        style={{
          fontSize: `${scaledFontSize}px`,
          background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}08)`,
        }}
      >
        {config.showDividers !== false && (
          <div className="w-12 h-0.5 rounded-full" style={{ backgroundColor: accentColor, opacity: TEXT_OPACITY.secondary }} />
        )}
        <p className="text-center leading-relaxed italic px-4">
          {data.joke}
        </p>
        {config.showDividers !== false && (
          <div className="w-12 h-0.5 rounded-full" style={{ backgroundColor: accentColor, opacity: TEXT_OPACITY.secondary }} />
        )}
      </div>
    </ModuleWrapper>
  );
}

'use client';

import type { DadJokeConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { dadJokeUrl } from '@/lib/fetch-keys';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';

interface DadJokeModuleProps {
  config: DadJokeConfig;
  style: ModuleStyle;
}

export default function DadJokeModule({ config, style }: DadJokeModuleProps) {
  const [data, error] = useFetchData<{ joke: string }>(dadJokeUrl(), config.refreshIntervalMs);
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.10);

  if (data === null) {
    return <ModuleLoadingState style={style} message="Loading joke…" error={error} />;
  }

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="flex items-center justify-center h-full" style={{ fontSize: `${scaledFontSize}px` }}>
        <p className="text-center leading-relaxed italic">
          {data.joke}
        </p>
      </div>
    </ModuleWrapper>
  );
}

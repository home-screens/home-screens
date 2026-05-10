'use client';

import type { DadJokeConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { dadJokeUrl } from '@/lib/fetch-keys';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { resolveAccent } from '@/lib/constants';
import { AccentDivider } from './shared/AccentDivider';
import { useTranslate } from '@/i18n';

interface DadJokeModuleProps {
  config: DadJokeConfig;
  style: ModuleStyle;
}

export default function DadJokeModule({ config, style }: DadJokeModuleProps) {
  const t = useTranslate('modules');
  const [data, error] = useFetchData<{ joke: string }>(dadJokeUrl(), config.refreshIntervalMs);
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.10);
  const { accentColor, hasAccent, gradientStyle } = resolveAccent(config);

  if (data === null) {
    return <ModuleLoadingState style={style} message={t('dad-joke.loading')} error={error} />;
  }

  return (
    <ModuleWrapper style={style}>
      <div
        ref={containerRef}
        className="flex flex-col items-center justify-center h-full gap-3"
        style={{ fontSize: `${scaledFontSize}px`, ...gradientStyle }}
      >
        {config.showDividers !== false && (
          <AccentDivider accentColor={accentColor} hasAccent={hasAccent} />
        )}
        <p className="text-center leading-relaxed italic px-4">
          {data.joke}
        </p>
        {config.showDividers !== false && (
          <AccentDivider accentColor={accentColor} hasAccent={hasAccent} />
        )}
      </div>
    </ModuleWrapper>
  );
}

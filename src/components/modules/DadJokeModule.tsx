'use client';

import type { DadJokeConfig, ModuleStyle } from '@/types/config';
import { moduleGate } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { dadJokeUrl } from '@/lib/fetch-keys';
import { AccentDivider } from './shared/AccentDivider';
import { ScaledAccentContent } from './shared/ScaledAccentContent';
import { useTranslate } from '@/i18n';

interface DadJokeModuleProps {
  config: DadJokeConfig;
  style: ModuleStyle;
}

export default function DadJokeModule({ config, style }: DadJokeModuleProps) {
  const t = useTranslate('modules');
  const [data, error] = useFetchData<{ joke: string }>(dadJokeUrl(), config.refreshIntervalMs);

  const gate = moduleGate({ style, data, error, loadingMessage: t('dad-joke.loading') });
  if (gate || !data) return gate;

  return (
    <ScaledAccentContent
      style={style}
      config={config}
      minScale={0.10}
      className="flex flex-col items-center justify-center h-full gap-3"
    >
      {({ accentColor, hasAccent }) => (
        <>
          {config.showDividers !== false && (
            <AccentDivider accentColor={accentColor} hasAccent={hasAccent} />
          )}
          <p className="text-center leading-relaxed italic px-4">
            {data.joke}
          </p>
          {config.showDividers !== false && (
            <AccentDivider accentColor={accentColor} hasAccent={hasAccent} />
          )}
        </>
      )}
    </ScaledAccentContent>
  );
}

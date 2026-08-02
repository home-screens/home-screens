'use client';

import type { HistoryConfig, ModuleStyle } from '@/types/config';
import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import { moduleGate } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { historyUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { TEXT_OPACITY } from '@/lib/constants';
import { SectionHeader } from './shared/SectionHeader';
import { AccentDivider } from './shared/AccentDivider';
import { ScaledAccentContent } from './shared/ScaledAccentContent';
import { useTranslate } from '@/i18n';
import type { HistoryResponse } from '@/lib/history-types';

interface HistoryModuleProps {
  config: HistoryConfig;
  style: ModuleStyle;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['history']?.ttlMs ?? 3_600_000;

export default function HistoryModule({ config, style }: HistoryModuleProps) {
  const t = useTranslate('modules');
  const [data, error] = useFetchData<HistoryResponse>(historyUrl(config), config.refreshIntervalMs ?? DEFAULT_REFRESH_MS);
  const events = data?.events ?? [];

  const rotationMs = config.rotationIntervalMs ?? 10000;
  const index = useRotatingIndex(events.length, rotationMs);

  const gate = moduleGate({ style, data, error, loadingMessage: t('history.loading') });
  if (gate) return gate;

  const event = events[index % events.length];
  const yearsAgo = event ? new Date().getFullYear() - parseInt(event.year, 10) : 0;

  return (
    <ScaledAccentContent
      style={style}
      config={config}
      minScale={0.08}
      className="flex flex-col items-center justify-center h-full gap-2 relative overflow-hidden"
    >
      {({ accentColor, hasAccent }) => (
        <>
          <SectionHeader>{t('history.header')}</SectionHeader>
          {config.showDividers !== false && (
            <AccentDivider accentColor={accentColor} hasAccent={hasAccent} />
          )}

          {events.length > 0 && event ? (
            <div className="text-center px-4">
              <p className="leading-relaxed">
                <span className="font-bold">{event.year}</span>
                {' — '}
                {event.text}
              </p>

              {yearsAgo > 0 && (
                <span
                  className="inline-block mt-2 px-2 py-0.5 rounded-full"
                  style={{
                    fontSize: '0.7em',
                    backgroundColor: hasAccent ? `${accentColor}20` : 'rgba(255,255,255,0.08)',
                    color: hasAccent ? accentColor : 'rgba(255,255,255,0.7)',
                  }}
                >
                  {t('history.yearsAgo', { count: yearsAgo })}
                </span>
              )}
            </div>
          ) : (
            <p className="text-center" style={{ opacity: TEXT_OPACITY.tertiary }}>{t('history.noEvents')}</p>
          )}
        </>
      )}
    </ScaledAccentContent>
  );
}

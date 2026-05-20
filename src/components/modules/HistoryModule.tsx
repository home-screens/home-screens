'use client';

import type { HistoryConfig, ModuleStyle } from '@/types/config';
import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { historyUrl } from '@/lib/fetch-keys';
import { TEXT_OPACITY, resolveAccent } from '@/lib/constants';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { SectionHeader } from './shared/SectionHeader';
import { AccentDivider } from './shared/AccentDivider';
import { useTranslate } from '@/i18n';

interface HistoryModuleProps {
  config: HistoryConfig;
  style: ModuleStyle;
}

interface HistoryEvent {
  year: string;
  text: string;
  source?: 'muffinlabs' | 'wikipedia';
}

export default function HistoryModule({ config, style }: HistoryModuleProps) {
  const t = useTranslate('modules');
  const [data, error] = useFetchData<{ events: HistoryEvent[] }>(historyUrl(config), config.refreshIntervalMs ?? 86400000);
  const events = data?.events ?? [];

  const rotationMs = config.rotationIntervalMs ?? 10000;
  const index = useRotatingIndex(events.length, rotationMs);
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.08);
  const { accentColor, hasAccent, gradientStyle } = resolveAccent(config);

  if (data === null) {
    return <ModuleLoadingState style={style} message={t('history.loading')} error={error} />;
  }

  const event = events[index % events.length];
  const yearsAgo = event ? new Date().getFullYear() - parseInt(event.year, 10) : 0;

  return (
    <ModuleWrapper style={style}>
      <div
        ref={containerRef}
        className="flex flex-col items-center justify-center h-full gap-2 relative overflow-hidden"
        style={{ fontSize: `${scaledFontSize}px`, ...gradientStyle }}
      >
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
      </div>
    </ModuleWrapper>
  );
}

'use client';

import type { HistoryConfig, ModuleStyle } from '@/types/config';
import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { historyUrl } from '@/lib/fetch-keys';
import { TEXT_OPACITY } from '@/lib/constants';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { SectionHeader } from './shared/SectionHeader';

interface HistoryModuleProps {
  config: HistoryConfig;
  style: ModuleStyle;
}

interface HistoryEvent {
  year: string;
  text: string;
}

export default function HistoryModule({ config, style }: HistoryModuleProps) {
  const [data, error] = useFetchData<{ events: HistoryEvent[] }>(historyUrl(), config.refreshIntervalMs ?? 86400000);
  const events = data?.events ?? [];

  const rotationMs = config.rotationIntervalMs ?? 10000;
  const index = useRotatingIndex(events.length, rotationMs);
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.08);

  if (data === null) {
    return <ModuleLoadingState style={style} message="Loading history…" error={error} />;
  }

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="flex flex-col items-center justify-center h-full gap-2" style={{ fontSize: `${scaledFontSize}px` }}>
        <SectionHeader>On This Day</SectionHeader>
        {events.length > 0 ? (
          <p className="text-center leading-relaxed">
            <span className="font-bold">{events[index % events.length].year}</span>
            {' — '}
            {events[index % events.length].text}
          </p>
        ) : (
          <p className="text-center" style={{ opacity: TEXT_OPACITY.tertiary }}>No events found</p>
        )}
      </div>
    </ModuleWrapper>
  );
}

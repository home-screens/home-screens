'use client';

import type { TrafficConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState, moduleGate } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { trafficUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { TEXT_OPACITY } from '@/lib/constants';
import { SectionHeader } from './shared/SectionHeader';
import { ContentCard } from './shared/ContentCard';
import { useTranslate } from '@/i18n';

interface TrafficModuleProps {
  config: TrafficConfig;
  style: ModuleStyle;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['traffic']?.ttlMs ?? 300_000;

interface TrafficRouteData {
  label: string;
  durationMinutes: number;
  durationInTrafficMinutes: number;
  delayMinutes: number;
}

interface TrafficData {
  routes: TrafficRouteData[];
  mock?: boolean;
}

function delayColor(delayMinutes: number): string {
  if (delayMinutes <= 2) return '#22c55e';
  if (delayMinutes <= 10) return '#eab308';
  return '#ef4444';
}

export default function TrafficModule({ config, style }: TrafficModuleProps) {
  const t = useTranslate('modules');
  const routes = config.routes ?? [];
  const [data, error] = useFetchData<TrafficData>(trafficUrl(config) ?? '', config.refreshIntervalMs ?? DEFAULT_REFRESH_MS);

  if (routes.length === 0) {
    return <ModuleEmptyState style={style} message={t('traffic.noRoutes')} />;
  }

  const gate = moduleGate({ style, data, error, loadingMessage: t('traffic.loading') });
  if (gate) return gate;

  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col h-full gap-2">
        {config.showTitle !== false && (
          <SectionHeader className="text-center">{t('traffic.sectionTitle')}</SectionHeader>
        )}

        {data && (
          <div className="flex flex-col gap-2">
            {data.routes.map((route, i) => {
              const color = delayColor(route.delayMinutes);
              return (
                <ContentCard key={i} style={{ borderLeft: `3px solid ${color}`, paddingLeft: '12px' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate" style={{ fontSize: '0.875em' }}>{route.label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold tabular-nums" style={{ fontSize: '1.5em', lineHeight: 1 }}>
                        {route.durationInTrafficMinutes}
                      </span>
                      <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>{t('traffic.unitMin')}</span>
                      {route.delayMinutes > 0 && (
                        <span
                          className="px-1.5 py-0.5 rounded-full font-medium tabular-nums"
                          style={{
                            fontSize: '0.7em',
                            backgroundColor: `${color}20`,
                            color: color,
                          }}
                        >
                          +{route.delayMinutes}
                        </span>
                      )}
                    </div>
                  </div>
                </ContentCard>
              );
            })}
            {data.mock && (
              <p className="text-center italic" style={{ fontSize: '0.65em', marginTop: '0.25em', opacity: TEXT_OPACITY.tertiary }}>
                {t('traffic.mockNotice')}
              </p>
            )}
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}

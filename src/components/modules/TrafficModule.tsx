'use client';

import type { TrafficConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState, ModuleEmptyState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { trafficUrl } from '@/lib/fetch-keys';
import { TEXT_OPACITY } from '@/lib/constants';
import { SectionHeader } from './shared/SectionHeader';
import { MetadataText } from './shared/MetadataText';

interface TrafficModuleProps {
  config: TrafficConfig;
  style: ModuleStyle;
}

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
  if (delayMinutes <= 2) return '#22c55e'; // green
  if (delayMinutes <= 10) return '#eab308'; // yellow
  return '#ef4444'; // red
}

export default function TrafficModule({ config, style }: TrafficModuleProps) {
  const routes = config.routes ?? [];
  const [data, error] = useFetchData<TrafficData>(trafficUrl(config) ?? '', config.refreshIntervalMs ?? 300000);

  if (routes.length === 0) {
    return <ModuleEmptyState style={style} message="No routes configured" />;
  }

  if (data === null) {
    return <ModuleLoadingState style={style} message="Loading traffic…" error={error} />;
  }

  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col h-full gap-2">
        <SectionHeader className="text-center">Traffic</SectionHeader>

        {data && (
          <div className="flex flex-col gap-2">
            {data.routes.map((route, i) => (
              <div key={i} className="flex items-center gap-3">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: delayColor(route.delayMinutes) }}
                />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate" style={{ fontSize: '0.875em' }}>{route.label}</span>
                  <MetadataText>
                    {route.durationInTrafficMinutes} min
                    {route.delayMinutes > 0 && (
                      <span style={{ color: delayColor(route.delayMinutes) }}>
                        {' '}(+{route.delayMinutes} min)
                      </span>
                    )}
                  </MetadataText>
                </div>
              </div>
            ))}
            {data.mock && (
              <p className="text-center opacity-40 italic" style={{ fontSize: '0.65em', marginTop: '0.25em' }}>
                Sample data — add a traffic API key in Settings
              </p>
            )}
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}

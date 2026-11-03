'use client';

import type { TrafficConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState, ModuleSetupState, moduleGate } from './ModuleStates';
import { useModuleSurface } from './module-surface';
import { useFetchData } from '@/hooks/useFetchData';
import { useSettledValue } from '@/hooks/useSettledValue';
import { trafficUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { trafficRows, type TrafficRouteError, type TrafficRouteResult, type TrafficRow } from '@/lib/traffic-routes';
import { TEXT_OPACITY, ink } from '@/lib/constants';
import { SectionHeader } from './shared/SectionHeader';
import { ContentCard } from './shared/ContentCard';
import { useTranslate } from '@/i18n';
import { withAlpha } from '@/lib/hex-color';

interface TrafficModuleProps {
  config: TrafficConfig;
  style: ModuleStyle;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['traffic']?.ttlMs ?? 300_000;
/** A pause in typing long enough to read as a finished address. */
const TYPING_SETTLE_MS = 800;

interface TrafficData {
  routes: TrafficRouteResult[];
  mock?: boolean;
}

const ROUTE_ERROR_KEYS: Record<TrafficRouteError, string> = {
  notFound: 'traffic.routeNotFound',
  unavailable: 'traffic.routeUnavailable',
};

function delayColor(delayMinutes: number): string {
  if (delayMinutes <= 2) return '#22c55e';
  if (delayMinutes <= 10) return '#eab308';
  return '#ef4444';
}

/**
 * One route: its drive time, or a plain line in its place saying why there
 * is none. A route with no time gets a neutral edge, not a delay color.
 */
function TrafficRouteCard({ row }: { row: TrafficRow }) {
  const t = useTranslate('modules');
  const times = row.state === 'answered' && !('error' in row.result) ? row.result : null;
  let note: string | null = null;
  if (row.state === 'incomplete') note = t('traffic.routeIncomplete');
  else if ('error' in row.result) note = t(ROUTE_ERROR_KEYS[row.result.error]);
  const edge = times ? delayColor(times.delayMinutes) : ink(0.25);
  return (
    <ContentCard style={{ borderLeft: `3px solid ${edge}`, paddingLeft: '12px' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="font-medium truncate" style={{ fontSize: '0.875em' }}>{row.route.label}</span>
          {note && (
            <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>{note}</span>
          )}
        </div>
        {times && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-bold tabular-nums" style={{ fontSize: '1.5em', lineHeight: 1 }}>
              {times.durationInTrafficMinutes}
            </span>
            <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>{t('traffic.unitMin')}</span>
            {times.delayMinutes > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full font-medium tabular-nums"
                style={{
                  fontSize: '0.7em',
                  backgroundColor: withAlpha(edge, 0.125),
                  color: edge,
                }}
              >
                +{times.delayMinutes}
              </span>
            )}
          </div>
        )}
      </div>
    </ContentCard>
  );
}

export default function TrafficModule({ config, style }: TrafficModuleProps) {
  const t = useTranslate('modules');
  const surface = useModuleSurface();
  const routes = config.routes ?? [];
  // The address follows each key typed into a route in the editor, so wait
  // for the typing to settle rather than paying for a lookup per letter.
  const url = useSettledValue(trafficUrl(config), TYPING_SETTLE_MS);
  const [data, error] = useFetchData<TrafficData>(url ?? '', config.refreshIntervalMs ?? DEFAULT_REFRESH_MS);

  if (routes.length === 0) {
    return <ModuleEmptyState style={style} type="traffic" message={t('traffic.noRoutes')} />;
  }

  // With no route complete yet there is nothing to ask for: the rows below
  // show each one waiting for its addresses instead of a loader that never ends.
  if (url) {
    const gate = moduleGate({ style, data, error, loadingMessage: t('traffic.loading') });
    if (gate) return gate;
  }

  // Without a traffic key the route answers with made-up minutes. Those are
  // fine as a shape preview in the editor, but confident fake numbers on the
  // wall are worse than an empty box: the wall gets the setup card instead.
  if (data?.mock && surface === 'display') {
    return <ModuleSetupState style={style} message={t('traffic.needsKey')} />;
  }

  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col h-full gap-2">
        {config.showTitle !== false && (
          <SectionHeader className="text-center">{t('traffic.sectionTitle')}</SectionHeader>
        )}

        <div className="flex flex-col gap-2">
          {trafficRows(routes, data?.routes).map((row, i) => <TrafficRouteCard key={i} row={row} />)}
          {data?.mock && (
            <p className="text-center italic" style={{ fontSize: '0.65em', marginTop: '0.25em', opacity: TEXT_OPACITY.tertiary }}>
              {t('traffic.mockNotice')}
            </p>
          )}
        </div>
      </div>
    </ModuleWrapper>
  );
}

'use client';

import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import RefreshIntervalSlider from './RefreshIntervalSlider';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useIndexListEditor } from '@/hooks/useListEditor';
import { NESTED_INPUT_CLASS } from '@/components/editor/PropertyPanel';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, TrafficConfig } from '@/types/config';

export function TrafficConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Partial<TrafficConfig>>(mod, screenId);
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const routes = c.routes ?? [];

  const { add: addRoute, remove: removeRoute, update: updateRoute } = useIndexListEditor(
    routes,
    'routes',
    set,
    { label: t('configSections.traffic.newRouteLabel'), origin: '', destination: '' }
  );

  return (
    <div className="space-y-2">
      <Toggle label={t('common.showTitle')} checked={c.showTitle !== false} onChange={(v) => set({ showTitle: v })} />
      <RefreshIntervalSlider
        value={c.refreshIntervalMs}
        onChange={(ms) => set({ refreshIntervalMs: ms })}
        fetchKey="traffic"
        fallbackMs={300_000}
        unit="minutes"
        min={1}
        max={30}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-hs-text-muted">{t('configSections.traffic.routes')}</span>
        <Button size="sm" onClick={addRoute}>{tCore('actions.add')}</Button>
      </div>
      {routes.map((r, idx) => (
        <div key={idx} className="p-2 bg-hs-card rounded space-y-1">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={r.label}
              onChange={(e) => updateRoute(idx, { label: e.target.value })}
              placeholder={t('configSections.traffic.labelPlaceholder')}
              className={`flex-1 ${NESTED_INPUT_CLASS}`}
            />
            <button onClick={() => removeRoute(idx)} className="text-hs-danger text-xs px-1">x</button>
          </div>
          <input
            type="text"
            value={r.origin}
            onChange={(e) => updateRoute(idx, { origin: e.target.value })}
            placeholder={t('configSections.traffic.originPlaceholder')}
            className={NESTED_INPUT_CLASS}
          />
          <input
            type="text"
            value={r.destination}
            onChange={(e) => updateRoute(idx, { destination: e.target.value })}
            placeholder={t('configSections.traffic.destinationPlaceholder')}
            className={NESTED_INPUT_CLASS}
          />
        </div>
      ))}
    </div>
  );
}

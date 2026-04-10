'use client';

import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useIndexListEditor } from '@/hooks/useListEditor';
import { NESTED_INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance } from '@/types/config';

export function TrafficConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ routes?: { label: string; origin: string; destination: string }[]; refreshIntervalMs?: number }>(mod, screenId);
  const routes = c.routes ?? [];

  const { add: addRoute, remove: removeRoute, update: updateRoute } = useIndexListEditor(
    routes,
    'routes',
    set,
    { label: 'Work', origin: '', destination: '' }
  );

  return (
    <div className="space-y-2">
      <Slider
        label="Refresh (minutes)"
        value={(c.refreshIntervalMs ?? 300000) / 60000}
        min={1}
        max={30}
        onChange={(v) => set({ refreshIntervalMs: v * 60000 })}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-hs-text-muted">Routes</span>
        <Button size="sm" onClick={addRoute}>Add</Button>
      </div>
      {routes.map((r, idx) => (
        <div key={idx} className="p-2 bg-hs-card rounded space-y-1">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={r.label}
              onChange={(e) => updateRoute(idx, { label: e.target.value })}
              placeholder="Label"
              className={`flex-1 ${NESTED_INPUT_CLASS}`}
            />
            <button onClick={() => removeRoute(idx)} className="text-hs-danger text-xs px-1">x</button>
          </div>
          <input
            type="text"
            value={r.origin}
            onChange={(e) => updateRoute(idx, { origin: e.target.value })}
            placeholder="Origin address"
            className={NESTED_INPUT_CLASS}
          />
          <input
            type="text"
            value={r.destination}
            onChange={(e) => updateRoute(idx, { destination: e.target.value })}
            placeholder="Destination address"
            className={NESTED_INPUT_CLASS}
          />
        </div>
      ))}
    </div>
  );
}

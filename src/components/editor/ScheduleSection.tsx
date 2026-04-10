'use client';

import { useEditorStore } from '@/stores/editor-store';
import Toggle from '@/components/ui/Toggle';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, ModuleSchedule } from '@/types/config';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ScheduleSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { updateModule } = useEditorStore();
  const schedule = mod.schedule;
  const enabled = !!schedule;

  const setSchedule = (updates: Partial<ModuleSchedule>) => {
    updateModule(screenId, mod.id, {
      schedule: { ...schedule, ...updates },
    });
  };

  const toggleEnabled = (on: boolean) => {
    if (on) {
      updateModule(screenId, mod.id, {
        schedule: { daysOfWeek: [1, 2, 3, 4, 5] },
      });
    } else {
      updateModule(screenId, mod.id, { schedule: undefined });
    }
  };

  const toggleDay = (day: number) => {
    const current = schedule?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    // Prevent deselecting the last day — at least one must remain active
    if (next.length === 0) return;
    setSchedule({ daysOfWeek: next });
  };

  return (
    <div className="space-y-3">
      <Toggle label="Enable Schedule" checked={enabled} onChange={toggleEnabled} />

      {enabled && (
        <>
          {/* Days of week */}
          <div>
            <span className="text-xs text-hs-text-muted mb-1 block">Days</span>
            <div className="flex gap-1">
              {DAYS.map((label, i) => {
                const days = schedule?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
                const active = days.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                      active
                        ? 'bg-hs-accent text-white'
                        : 'bg-hs-card text-hs-text-faint hover:bg-hs-hover'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time window */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">From</span>
              <input
                type="time"
                value={schedule?.startTime ?? ''}
                onChange={(e) => setSchedule({ startTime: e.target.value || undefined })}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">Until</span>
              <input
                type="time"
                value={schedule?.endTime ?? ''}
                onChange={(e) => setSchedule({ endTime: e.target.value || undefined })}
                className={INPUT_CLASS}
              />
            </label>
          </div>

          {/* Invert toggle */}
          <Toggle
            label="Invert (hide during window)"
            checked={!!schedule?.invert}
            onChange={(v) => setSchedule({ invert: v || undefined })}
          />
        </>
      )}
    </div>
  );
}

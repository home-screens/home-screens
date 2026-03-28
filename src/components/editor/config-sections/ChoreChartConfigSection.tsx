'use client';

import { useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import ViewSelect from '@/components/editor/ViewSelect';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import ChoreChartModal from '@/components/editor/ChoreChartModal';
import type {
  ModuleInstance,
  ChoreChartView,
  ChoreMember,
  ChoreDefinition,
} from '@/types/config';

type Config = {
  view?: ChoreChartView;
  members?: ChoreMember[];
  chores?: ChoreDefinition[];
  weekStartDay?: 'sunday' | 'monday';
  showPoints?: boolean;
  showStreaks?: boolean;
  showTimeOfDay?: boolean;
  allowDisplayComplete?: boolean;
  accentColor?: string;
};

const VIEWS: { value: ChoreChartView; label: string }[] = [
  { value: 'board', label: 'Board (Column per Member)' },
  { value: 'star-chart', label: 'Star Chart (Weekly Grid)' },
  { value: 'today', label: "Today (Time of Day)" },
  { value: 'progress', label: 'Progress (Rings)' },
  { value: 'compact', label: 'Compact (Dense Grid)' },
];

export function ChoreChartConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const [showModal, setShowModal] = useState(false);

  const members = c.members ?? [];
  const chores = c.chores ?? [];

  return (
    <>
      {/* View Mode */}
      <ViewSelect
        value={c.view ?? 'board'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Week Start */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">Week Starts On</span>
        <select
          value={c.weekStartDay ?? 'monday'}
          onChange={(e) => set({ weekStartDay: e.target.value as 'sunday' | 'monday' })}
          className={INPUT_CLASS}
        >
          <option value="sunday">Sunday</option>
          <option value="monday">Monday</option>
        </select>
      </label>

      {/* Display Toggles */}
      <Toggle
        label="Show Points"
        checked={c.showPoints ?? true}
        onChange={(v) => set({ showPoints: v })}
      />
      <Toggle
        label="Show Streaks"
        checked={c.showStreaks ?? true}
        onChange={(v) => set({ showStreaks: v })}
      />
      <Toggle
        label="Show Time of Day"
        checked={c.showTimeOfDay ?? true}
        onChange={(v) => set({ showTimeOfDay: v })}
      />
      <Toggle
        label="Tap to Complete (Display)"
        checked={c.allowDisplayComplete ?? true}
        onChange={(v) => set({ allowDisplayComplete: v })}
      />

      {/* Accent Color */}
      <ColorPicker
        label="Accent Color"
        value={c.accentColor ?? '#f59e0b'}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Open Modal */}
      <div className="pt-1 border-t border-neutral-700 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>{members.length} members</span>
          <span>&middot;</span>
          <span>{chores.length} chores</span>
        </div>
        <Button
          variant="primary"
          className="w-full text-xs"
          onClick={() => setShowModal(true)}
        >
          Edit Chore Chart
        </Button>
      </div>

      {/* Mobile hint */}
      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Family members can check off chores from their phone at{' '}
        <span className="text-neutral-400">{typeof window !== 'undefined' ? `${window.location.origin}/chores` : '/chores'}</span>
      </p>

      {/* Modal */}
      {showModal && (
        <ChoreChartModal
          members={members}
          chores={chores}
          weekStartDay={c.weekStartDay ?? 'monday'}
          accentColor={c.accentColor ?? '#f59e0b'}
          onUpdate={set}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

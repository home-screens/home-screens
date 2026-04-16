'use client';

import { useState, useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import ViewSelect from '@/components/editor/ViewSelect';
import ChoreChartModal from '@/components/editor/ChoreChartModal';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import type {
  ModuleInstance,
  ChoreChartView,
} from '@/types/config';

type Config = {
  view?: ChoreChartView;
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

const WEEK_START_OPTIONS = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
] as const;

export function ChoreChartConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const [showModal, setShowModal] = useState(false);
  const [counts, setCounts] = useState({ members: 0, chores: 0 });

  useEffect(() => {
    editorFetch('/api/chores/data')
      .then((r) => r.json())
      .then((d) => setCounts({ members: d.members?.length ?? 0, chores: d.chores?.length ?? 0 }))
      .catch(() => {});
  }, [showModal]); // re-fetch when modal closes

  return (
    <>
      {/* View Mode */}
      <ViewSelect
        value={c.view ?? 'board'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Week Start */}
      <LabeledSelect
        label="Week Starts On"
        value={c.weekStartDay ?? 'monday'}
        onChange={(v) => set({ weekStartDay: v })}
        options={WEEK_START_OPTIONS}
      />

      {/* Display Toggles */}
      <Toggle
        label="Show Tickets"
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
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Open Modal */}
      <div className="pt-1 border-t border-hs-border-strong space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-hs-text-faint">
          <span>{counts.members} members</span>
          <span>&middot;</span>
          <span>{counts.chores} chores</span>
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
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        Family members can check off chores from their phone via the Chores tab at{' '}
        <span className="text-hs-text-muted">{typeof window !== 'undefined' ? `${window.location.origin}/remote` : '/remote'}</span>
      </p>

      {/* Modal */}
      {showModal && (
        <ChoreChartModal
          weekStartDay={c.weekStartDay ?? 'monday'}
          accentColor={c.accentColor ?? DEFAULT_ACCENT_COLOR}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import LabeledField from '@/components/ui/LabeledField';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import ChoreChartModal from '@/components/editor/ChoreChartModal';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { DEFAULT_ACCENT_COLOR, TYPOGRAPHY_SIZES } from '@/lib/meal-constants';
import type {
  ModuleInstance,
  FullscreenChoreChartConfig,
  FullscreenChoreChartView,
} from '@/types/config';

type Config = Partial<FullscreenChoreChartConfig>;

const VIEW_OPTIONS: { value: FullscreenChoreChartView; label: string }[] = [
  { value: 'chores', label: 'Chore Board' },
  { value: 'rewards-store', label: 'Rewards Store' },
];

const DENSITY_OPTIONS = [
  { value: 'cozy', label: 'Cozy' },
  { value: 'snug', label: 'Snug' },
] as const;

const WEEK_START_OPTIONS = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
] as const;

export function FullscreenChoreChartConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const [showModal, setShowModal] = useState(false);
  const [counts, setCounts] = useState({ members: 0, chores: 0 });

  const isChoreBoard = (c.view ?? 'chores') === 'chores';

  useEffect(() => {
    editorFetch('/api/chores/data')
      .then((r) => r.json())
      .then((d) => setCounts({ members: d.members?.length ?? 0, chores: d.chores?.length ?? 0 }))
      .catch(() => {});
  }, [showModal]);

  return (
    <>
      {/* View */}
      <LabeledSelect
        label="View"
        value={c.view ?? 'chores'}
        onChange={(v) => set({ view: v })}
        options={VIEW_OPTIONS}
      />

      {/* Show Rewards Button — only relevant on chore board */}
      {isChoreBoard && (
        <>
          <Toggle
            label="Show Rewards Button"
            checked={c.showRewardsButton ?? false}
            onChange={(v) => set({ showRewardsButton: v })}
          />
          <p className="text-[11px] text-hs-text-faint leading-relaxed -mt-1">
            Adds a button on the chore board so kids can switch to the rewards store. Best for touch-enabled displays.
          </p>
        </>
      )}

      {/* Theme Override */}
      <LabeledField label="Theme">
        <select
          value={c.theme ?? ''}
          onChange={(e) => set({ theme: e.target.value || undefined })}
          className={INPUT_CLASS}
        >
          <option value="">Default (from Settings)</option>
          {FULLSCREEN_THEMES.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.group})</option>
          ))}
        </select>
      </LabeledField>

      {/* Density */}
      <LabeledSelect
        label="Density"
        value={c.density ?? 'cozy'}
        onChange={(v) => set({ density: v })}
        options={DENSITY_OPTIONS}
      />

      {/* Typography Size */}
      <LabeledSelect
        label="Typography Size"
        value={c.typographySize ?? 'medium'}
        onChange={(v) => set({ typographySize: v })}
        options={TYPOGRAPHY_SIZES}
      />

      {/* Accent Color */}
      <ColorPicker
        label="Accent Color"
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* ── Chore Board-only settings ── */}
      {isChoreBoard && (
        <>
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
            Family members can check off chores on the touchscreen or from their phone via the Chores tab at{' '}
            <span className="text-hs-text-muted">{typeof window !== 'undefined' ? `${window.location.origin}/remote` : '/remote'}</span>
          </p>
        </>
      )}

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

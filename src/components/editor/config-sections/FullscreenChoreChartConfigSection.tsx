'use client';

import { useState, useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import ChoreChartModal from '@/components/editor/ChoreChartModal';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { DEFAULT_ACCENT_COLOR, TYPOGRAPHY_SIZES } from '@/lib/meal-constants';
import type {
  ModuleInstance,
  FullscreenChoreChartConfig,
} from '@/types/config';

type Config = Partial<FullscreenChoreChartConfig>;

export function FullscreenChoreChartConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
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
      {/* Theme Override */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Theme</span>
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
      </label>

      {/* Density */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Density</span>
        <select
          value={c.density ?? 'cozy'}
          onChange={(e) => set({ density: e.target.value as 'cozy' | 'snug' })}
          className={INPUT_CLASS}
        >
          <option value="cozy">Cozy</option>
          <option value="snug">Snug</option>
        </select>
      </label>

      {/* Typography Size */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Typography Size</span>
        <select
          value={c.typographySize ?? 'medium'}
          onChange={(e) => set({ typographySize: e.target.value as typeof TYPOGRAPHY_SIZES[number]['value'] })}
          className={INPUT_CLASS}
        >
          {TYPOGRAPHY_SIZES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      {/* Week Start */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Week Starts On</span>
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
        Family members can check off chores on the touchscreen or from their phone via the Chores tab at{' '}
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

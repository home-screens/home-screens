'use client';

import { useState, useEffect, useRef } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useEditorData } from '@/hooks/useEditorData';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import ViewSelect from '@/components/editor/ViewSelect';
import ChoreChartModal from '@/components/editor/ChoreChartModal';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
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
  showTitle?: boolean;
};

export function ChoreChartConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const [showModal, setShowModal] = useState(false);
  const { data: choreData, refetch: refetchCounts } = useEditorData<{ members?: unknown[]; chores?: unknown[] }>('/api/chores/data');
  const counts = { members: choreData?.members?.length ?? 0, chores: choreData?.chores?.length ?? 0 };

  const VIEWS: { value: ChoreChartView; label: string }[] = [
    { value: 'board', label: t('configSections.chore-chart.viewBoard') },
    { value: 'star-chart', label: t('configSections.chore-chart.viewStarChart') },
    { value: 'today', label: t('configSections.chore-chart.viewToday') },
    { value: 'progress', label: t('configSections.chore-chart.viewProgress') },
    { value: 'compact', label: t('configSections.chore-chart.viewCompact') },
  ];

  const WEEK_START_OPTIONS = [
    { value: 'sunday' as const, label: tCore('days.sunday') },
    { value: 'monday' as const, label: tCore('days.monday') },
  ];

  // Re-fetch member/chore counts when the modal closes (or opens). The hook
  // already loads on mount, so skip this effect's initial run to keep mount
  // at a single request.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    refetchCounts();
  }, [showModal, refetchCounts]);

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
        label={t('configSections.chore-chart.weekStartsOn')}
        value={c.weekStartDay ?? 'monday'}
        onChange={(v) => set({ weekStartDay: v })}
        options={WEEK_START_OPTIONS}
      />

      {/* Display Toggles */}
      <Toggle
        label={t('configSections.chore-chart.showTickets')}
        checked={c.showPoints ?? true}
        onChange={(v) => set({ showPoints: v })}
      />
      <Toggle
        label={t('configSections.chore-chart.showStreaks')}
        checked={c.showStreaks ?? true}
        onChange={(v) => set({ showStreaks: v })}
      />
      <Toggle
        label={t('configSections.chore-chart.showTimeOfDay')}
        checked={c.showTimeOfDay ?? true}
        onChange={(v) => set({ showTimeOfDay: v })}
      />
      <Toggle label={t('common.showTitle')} checked={c.showTitle !== false} onChange={(v) => set({ showTitle: v })} />
      <Toggle
        label={t('configSections.chore-chart.tapToComplete')}
        checked={c.allowDisplayComplete ?? true}
        onChange={(v) => set({ allowDisplayComplete: v })}
      />

      {/* Accent Color */}
      <ColorPicker
        label={t('configSections.chore-chart.accentColor')}
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Open Modal */}
      <div className="pt-1 border-t border-hs-border-strong space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-hs-text-faint">
          <span>{t('configSections.chore-chart.membersCount', { count: counts.members })}</span>
          <span>&middot;</span>
          <span>{t('configSections.chore-chart.choresCount', { count: counts.chores })}</span>
        </div>
        <Button
          variant="primary"
          className="w-full text-xs"
          onClick={() => setShowModal(true)}
        >
          {t('configSections.chore-chart.editChoreChart')}
        </Button>
      </div>

      {/* Mobile hint */}
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.chore-chart.mobileHintPrefix')}{' '}
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

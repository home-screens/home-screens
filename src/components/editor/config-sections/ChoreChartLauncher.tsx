'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import Button from '@/components/ui/Button';
import PhoneSurfaceLinks from '@/components/editor/PhoneSurfaceLinks';
import ChoreChartModal from '@/components/editor/ChoreChartModal';
import { useEditorData } from '@/hooks/useEditorData';
import { useFamilyData } from '@/hooks/useFamilyData';
import { useRefetchOnClose } from '@/hooks/useRefetchOnClose';

/**
 * The foot of both chore chart panels: how many people and chores there are,
 * the Edit Chore Chart button, where the phone pages live, and the chore
 * window. The counts are read again when the window closes.
 */
export default function ChoreChartLauncher({ weekStartDay, accentColor, keyPrefix }: {
  weekStartDay: 'sunday' | 'monday';
  /** The accent the window is drawn in: the module's own. */
  accentColor: string;
  /** Whose strings to use. */
  keyPrefix: 'chore-chart' | 'fullscreen-chore-chart';
}) {
  const t = useTranslate('editor');
  const [open, setOpen] = useState(false);
  const { data, refetch } = useEditorData<{ chores?: unknown[] }>('/api/chores/data');
  const { members } = useFamilyData();
  useRefetchOnClose(open, refetch);

  return (
    <>
      <div className="pt-1 border-t border-hs-border-strong space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-hs-text-faint">
          <span>{t(`configSections.${keyPrefix}.membersCount`, { count: members.length })}</span>
          <span>&middot;</span>
          <span>{t(`configSections.${keyPrefix}.choresCount`, { count: data?.chores?.length ?? 0 })}</span>
        </div>
        <Button
          variant="primary"
          className="w-full text-xs"
          onClick={() => setOpen(true)}
        >
          {t(`configSections.${keyPrefix}.editChoreChart`)}
        </Button>
      </div>

      {/* Kids check off on /chores; parents add and edit on /remote. Rewards are added there too. */}
      <PhoneSurfaceLinks context="chores" />

      {open && (
        <ChoreChartModal
          weekStartDay={weekStartDay}
          accentColor={accentColor}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

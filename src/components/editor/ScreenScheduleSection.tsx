'use client';

import { useEditorStore } from '@/stores/editor-store';
import type { ModuleSchedule } from '@/types/config';
import { ScheduleEditor } from './ScheduleEditor';

export function ScreenScheduleSection({
  screenId,
  schedule,
  statusTitle,
  opened = false,
}: {
  screenId: string;
  schedule: ModuleSchedule | undefined;
  statusTitle?: string;
  /** The screen shows only when opened: the words say when it can be opened. */
  opened?: boolean;
}) {
  const updateScreen = useEditorStore((s) => s.updateScreen);
  return (
    <ScheduleEditor
      schedule={schedule}
      onChange={(next) => updateScreen(screenId, { schedule: next })}
      statusTitle={statusTitle}
      wording={opened ? 'opened' : 'show'}
    />
  );
}

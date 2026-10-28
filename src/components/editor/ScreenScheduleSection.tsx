'use client';

import { useEditorStore } from '@/stores/editor-store';
import type { ModuleSchedule } from '@/types/config';
import { ScheduleEditor } from './ScheduleEditor';

export function ScreenScheduleSection({
  screenId,
  schedule,
  statusTitle,
}: {
  screenId: string;
  schedule: ModuleSchedule | undefined;
  statusTitle?: string;
}) {
  const updateScreen = useEditorStore((s) => s.updateScreen);
  return (
    <ScheduleEditor
      schedule={schedule}
      onChange={(next) => updateScreen(screenId, { schedule: next })}
      statusTitle={statusTitle}
    />
  );
}

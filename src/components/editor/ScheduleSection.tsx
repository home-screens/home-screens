'use client';

import { useEditorStore } from '@/stores/editor-store';
import type { ModuleInstance } from '@/types/config';
import { ScheduleEditor } from './ScheduleEditor';

export function ScheduleSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const updateModule = useEditorStore((s) => s.updateModule);
  return (
    <ScheduleEditor
      schedule={mod.schedule}
      onChange={(next) => updateModule(screenId, mod.id, { schedule: next })}
    />
  );
}

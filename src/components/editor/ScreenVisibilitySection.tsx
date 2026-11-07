'use client';

import { useEditorStore } from '@/stores/editor-store';
import type { ModuleVisibility } from '@/types/config';
import { VisibilityConditionsEditor } from './VisibilityConditionsSection';

/**
 * The screen's own visibility conditions, under Screen settings. Same editor
 * as a module's Conditions accordion with screen wording, saved through
 * `updateScreen`. The display applies it in the same filter as the screen
 * schedule (see `isScreenInRotation`).
 */
export function ScreenVisibilitySection({
  screenId,
  visibility,
  statusTitle,
  opened = false,
}: {
  screenId: string;
  visibility: ModuleVisibility | undefined;
  statusTitle?: string;
  /** The screen shows only when opened: the words say "be opened", not "be in the rotation". */
  opened?: boolean;
}) {
  const updateScreen = useEditorStore((s) => s.updateScreen);
  return (
    <VisibilityConditionsEditor
      visibility={visibility}
      onChange={(next) => updateScreen(screenId, { visibility: next })}
      subject={opened ? 'screenOpened' : 'screen'}
      statusTitle={statusTitle}
    />
  );
}

'use client';

import { useCallback } from 'react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { getModuleDefinition } from '@/lib/module-registry';
import { useTranslate } from '@/i18n';
import type { ModulePosition, ModuleType } from '@/types/config';

/**
 * addModule with one guard: a fillsCanvas module dropped on a screen that
 * already has modules covers all of them on the wall while the editor canvas
 * barely changes. Ask first — offer a fresh screen (the usual intent) or an
 * explicit "add here anyway". Shared by the palette click/Enter path and the
 * canvas drop path.
 */
export function useGuardedAddModule() {
  const t = useTranslate('editor');

  return useCallback(
    async (screenId: string, type: ModuleType, position?: ModulePosition) => {
      const state = useEditorStore.getState();
      const screen = state.config
        ? getActiveScreens(state.config, state.selectedDisplayId).find((s) => s.id === screenId)
        : undefined;
      if (getModuleDefinition(type)?.fillsCanvas && screen && screen.modules.length > 0) {
        const choice = await useConfirmStore.getState().choose({
          message: t('modulePalette.fullscreenGuard.message'),
          choices: [
            { value: 'new-screen', label: t('modulePalette.fullscreenGuard.newScreen'), variant: 'primary' },
            { value: 'here', label: t('modulePalette.fullscreenGuard.addAnyway'), variant: 'secondary' },
          ],
        });
        if (choice === null) return;
        if (choice === 'new-screen') {
          useEditorStore.getState().addScreen();
          // addScreen selects the screen it created.
          const newScreenId = useEditorStore.getState().selectedScreenId;
          if (newScreenId) useEditorStore.getState().addModule(newScreenId, type);
          return;
        }
      }
      useEditorStore.getState().addModule(screenId, type, position);
    },
    [t],
  );
}

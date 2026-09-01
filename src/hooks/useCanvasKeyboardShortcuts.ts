'use client';

import { useEffect } from 'react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { GRID_SIZE } from '@/lib/constants';
import { isDialogOpen, isMenuOpen, isTypingTarget } from '@/lib/editor-keyboard';
import { useTranslate } from '@/i18n';

const ARROW_DELTAS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Canvas keyboard shortcuts for the selected module: arrow nudge (1px, Shift
 * for one grid step), Delete/Backspace through the usual confirm, Escape to
 * deselect, Cmd/Ctrl+D to duplicate. Inert while typing in a field or while
 * any dialog or context menu is open, so a modal's or menu's own Escape/Delete
 * never leaks through to the canvas.
 */
export function useCanvasKeyboardShortcuts() {
  const t = useTranslate('editor');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || isDialogOpen() || isMenuOpen()) return;

      const store = useEditorStore.getState();
      const { selectedScreenId, selectedModuleId } = store;
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
        if (selectedScreenId && selectedModuleId) {
          e.preventDefault();
          store.duplicateModule(selectedScreenId, selectedModuleId);
        }
        return;
      }
      if (isMod || e.altKey) return;

      if (e.key === 'Escape') {
        if (selectedModuleId) store.selectModule(null);
        return;
      }
      if (!selectedScreenId || !selectedModuleId) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        void useConfirmStore.getState()
          .confirm(t('propertyPanel.actions.confirmDelete'))
          .then((ok) => {
            if (ok) useEditorStore.getState().removeModule(selectedScreenId, selectedModuleId);
          });
        return;
      }

      const delta = ARROW_DELTAS[e.key];
      if (delta) {
        e.preventDefault();
        const screen = store.config
          ? getActiveScreens(store.config, store.selectedDisplayId).find((s) => s.id === selectedScreenId)
          : undefined;
        const mod = screen?.modules.find((m) => m.id === selectedModuleId);
        if (!mod) return;
        const step = e.shiftKey ? GRID_SIZE : 1;
        // moveModule clamps to the canvas, so edge nudges are safe.
        store.moveModule(selectedScreenId, selectedModuleId, {
          x: mod.position.x + delta[0] * step,
          y: mod.position.y + delta[1] * step,
        });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [t]);
}

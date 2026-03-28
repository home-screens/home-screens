'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/stores/editor-store';

export function useUndoRedoShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      const isUndo = isMod && !e.shiftKey && key === 'z';
      const isRedo = (isMod && e.shiftKey && key === 'z') || (e.ctrlKey && !e.shiftKey && key === 'y');
      if (!isUndo && !isRedo) return;

      e.preventDefault();

      if (isRedo) {
        useEditorStore.getState().redo();
      } else {
        useEditorStore.getState().undo();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

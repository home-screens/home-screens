'use client';

import { useEffect } from 'react';
import { Undo2 } from 'lucide-react';
import Toast from '@/components/ui/Toast';
import { UNDO_WINDOW_MS } from '@/lib/undo-window';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';

/**
 * After a screen is deleted, the "You can undo this" the question promised,
 * as a button: the editor's own undo, which brings the screen back with its
 * modules and settings, and any open buttons that pointed at it.
 *
 * `history` is the undo history right after the deletion. Undo is only the
 * deletion's undo while the history is still that one, so once it moves on
 * (Cmd+Z, redo, another edit, a reload) the toast goes: its Undo would
 * otherwise take back whatever happened last, even the screen just restored.
 */
export default function DeletedScreenToast({ name, history, onDone }: { name: string; history: readonly unknown[]; onDone: () => void }) {
  const t = useTranslate('editor');
  useEffect(() => {
    const timer = setTimeout(onDone, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [history, onDone]);
  useEffect(
    () => useEditorStore.subscribe((state) => { if (state._past !== history) onDone(); }),
    [history, onDone],
  );
  return (
    <Toast
      testId="deleted-screen-toast"
      message={t('screenTabs.deletedToast', { name })}
      action={{
        label: t('screenTabs.undoDelete'),
        icon: Undo2,
        onClick: () => {
          const store = useEditorStore.getState();
          if (store._past === history) store.undo();
          onDone();
        },
      }}
      onDismiss={onDone}
      dismissLabel={t('screenTabs.dismissDeleted')}
    />
  );
}

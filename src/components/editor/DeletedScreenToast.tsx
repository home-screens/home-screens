'use client';

import { useEffect } from 'react';
import { Undo2, X } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';

/** How long the toast stays: long enough to read and reach for Undo. */
const DELETED_TOAST_MS = 8_000;

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
    const timer = setTimeout(onDone, DELETED_TOAST_MS);
    return () => clearTimeout(timer);
  }, [history, onDone]);
  useEffect(
    () => useEditorStore.subscribe((state) => { if (state._past !== history) onDone(); }),
    [history, onDone],
  );
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999]" role="status" data-testid="deleted-screen-toast">
      <div className="flex items-center gap-3 rounded-lg border border-hs-border-strong bg-hs-panel/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-black/30">
        <span className="text-sm text-hs-text-body">{t('screenTabs.deletedToast', { name })}</span>
        <button
          type="button"
          onClick={() => {
            const store = useEditorStore.getState();
            if (store._past === history) store.undo();
            onDone();
          }}
          className="flex items-center gap-1.5 rounded-md bg-hs-accent hover:bg-hs-accent-hover text-white text-xs font-medium px-3 py-1.5 transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" aria-hidden />
          {t('screenTabs.undoDelete')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-hs-text-faint hover:text-hs-text-secondary transition-colors p-0.5"
          aria-label={t('screenTabs.dismissDeleted')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

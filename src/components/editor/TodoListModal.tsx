'use client';

import { useEffect, useRef, useState } from 'react';
import { ListTodo } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import { HubUnreachableError, refusalText } from '@/lib/hub-request';
import { todoListsUrl } from '@/lib/fetch-keys';
import {
  TODO_LISTS_TTL_MS,
  addItemRequest,
  deleteItemRequest,
  listActionRequest,
  sendTodoWrite,
  updateItemRequest,
  updateListRequest,
  type TodoListsPayload,
  type TodoWriteRequest,
} from '@/lib/todo-client';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { useWriteSession } from '@/hooks/useWriteSession';
import Button from '@/components/ui/Button';
import CRUDModalShell from '@/components/editor/CRUDModalShell';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate } from '@/i18n';
import { useConfirmStore } from '@/stores/confirm-store';
import { TODO_LIMITS, type TodoList, type TodoListItem } from '@/types/todos';

interface TodoListModalProps {
  listId: string;
  onClose: () => void;
}

/** A row's text field: quiet until focused, so the list reads as a list and not a form. */
const ROW_INPUT_CLASS =
  'w-full px-2 py-1 text-sm bg-transparent border border-transparent rounded-md focus:outline-none focus:border-hs-border-strong focus:bg-hs-input transition-colors';

// ── Item row ──────────────────────────────────────────────────────

function ItemRow({
  item,
  onToggle,
  onSaveText,
  onDelete,
}: {
  item: TodoListItem;
  onToggle: (id: string, completed: boolean) => void;
  onSaveText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslate('editor');
  const [text, setText] = useState(item.text);
  // Counts keystrokes, not text changes: the save follows what was typed
  // here, never the server's wording being adopted. Keyed on the text
  // itself, adopting a stale copy (the row's blur lands before the save's
  // answer) scheduled a save of the old words over the new ones.
  const [edits, setEdits] = useState(0);
  const typed = useRef(text);
  typed.current = text;
  const editing = useRef(false);

  // Text is local-first: the row keeps what was typed and the debounced save
  // catches up. A pending edit is flushed when the row unmounts (modal closed
  // or item removed); `onSaveText` skips items that no longer exist.
  const { flush, hasPending } = useDebouncedSave({
    values: [edits],
    save: () => onSaveText(item.id, typed.current),
    flushOnUnmount: true,
  });

  // Adopt the server's wording when it changes and this row is not mid-edit,
  // so a rename made on a phone shows here instead of sitting behind a stale
  // copy. Only a change of the server's text counts: leaving the field is
  // not a reason to re-read it, since the save sent on blur has not been
  // answered yet.
  useEffect(() => {
    if (!editing.current && !hasPending()) setText(item.text);
  }, [item.text, hasPending]);

  return (
    <li className="flex items-center gap-2 rounded-md border border-hs-border bg-hs-card/60 px-2 py-1">
      <input
        type="checkbox"
        checked={item.completed}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        aria-label={t('todoListModal.itemDoneLabel', { text: item.text })}
        className="h-4 w-4 shrink-0 rounded border-hs-border-strong bg-hs-card text-hs-accent"
      />
      <input
        type="text"
        value={text}
        maxLength={TODO_LIMITS.maxItemTextLength}
        onChange={(e) => { setText(e.target.value); setEdits((n) => n + 1); }}
        onFocus={() => { editing.current = true; }}
        onBlur={() => {
          editing.current = false;
          // Only a real pending edit: a click through an untouched row must
          // not write its copy of the text back to the server.
          if (hasPending()) flush();
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && hasPending()) flush(); }}
        aria-label={t('todoListModal.itemTextLabel')}
        className={`${ROW_INPUT_CLASS} ${item.completed ? 'line-through text-hs-text-faint' : 'text-hs-text-body'}`}
      />
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        aria-label={t('todoListModal.removeItemLabel', { text: item.text })}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs text-hs-text-faint transition-colors hover:bg-hs-card hover:text-hs-danger"
      >
        &times;
      </button>
    </li>
  );
}

// ── Modal ─────────────────────────────────────────────────────────

async function loadLists(): Promise<TodoList[] | null> {
  const res = await editorFetch(todoListsUrl());
  if (!res.ok) return null;
  const data = (await res.json()) as TodoListsPayload;
  return Array.isArray(data.lists) ? data.lists : null;
}

/**
 * Edits one shared to-do list in place: name, items, and the two bulk
 * actions. Every change goes straight to `/api/todo/lists` so the wall, the
 * phone and the editor preview all see it. The lists are read once when the
 * modal opens; every write answers with them, and writes go out one at a
 * time in the order they were asked for (`useWriteSession`): a tick and an
 * untick a moment apart must land in that order, or the list keeps the
 * first one. A refused write is followed by a fresh read, so whatever it
 * changed locally does not stand.
 */
export default function TodoListModal({ listId, onClose }: TodoListModalProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [error, setError] = useState<string | null>(null);
  // The name as typed here; until something is typed the field shows the hub's.
  const [typedName, setTypedName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  const saveFailed = t('common.saveError');

  const { data: lists, loaded, loadError: loadFailed, write } = useWriteSession<TodoList[], TodoWriteRequest>({
    initial: [],
    load: loadLists,
    send: async (request) => ({ data: (await sendTodoWrite(editorFetch, request, saveFailed)).lists }),
    holdMs: TODO_LISTS_TTL_MS,
    onRefused: (e) => setError(e instanceof HubUnreachableError ? t('common.hubUnreachable') : refusalText(e, tCore, 'refusals.lists.failed')),
    // A write that went through clears an earlier refusal; the read after
    // a refusal does not, or the message would vanish unread.
    onSaved: () => setError(null),
  });

  const list = lists.find((l) => l.id === listId) ?? null;
  const loadError = loadFailed
    ? t('todoListModal.loadError')
    : loaded && !list
      ? t('todoListModal.listGone')
      : null;
  // The latest list the modal knows about, for callbacks that outlive a render
  // (a row's unmount flush must not resurrect an item that was just removed).
  const listRef = useRef<TodoList | null>(null);
  listRef.current = list;

  // ── Name ──
  const name = typedName ?? list?.name ?? '';
  const { flush: flushName } = useDebouncedSave({
    values: [typedName],
    enabled: loaded,
    save: () => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === listRef.current?.name) return;
      return write(null, updateListRequest(listId, { name: trimmed }));
    },
  });

  // ── Items ──
  const toggleItem = (itemId: string, completed: boolean) => {
    void write(
      (ls) => ls.map((l) => (l.id === listId ? { ...l, items: l.items.map((i) => (i.id === itemId ? { ...i, completed } : i)) } : l)),
      updateItemRequest(listId, itemId, { completed }),
    );
  };

  const saveItemText = (itemId: string, text: string) => {
    const current = listRef.current?.items.find((i) => i.id === itemId);
    const trimmed = text.trim();
    if (!current || !trimmed || trimmed === current.text) return;
    void write(null, updateItemRequest(listId, itemId, { text: trimmed }));
  };

  const deleteItem = (itemId: string) => {
    void write(null, deleteItemRequest(listId, itemId));
  };

  const addItem = async () => {
    const text = draft.trim();
    if (!text) return;
    // Clear the field now, not when the server answers: whoever typed this is
    // already typing the next one, and a clear that lands mid-word would eat
    // its first letters. A refused add puts the text back if nothing new has
    // been typed since.
    setDraft('');
    addInputRef.current?.focus();
    const saved = await write(null, addItemRequest(listId, text));
    if (!saved) setDraft((current) => current || text);
  };

  // ── Bulk actions ──
  const uncheckAll = () => {
    void write(null, listActionRequest(listId, 'uncheck-all'));
  };

  const removeDone = async () => {
    if (!list) return;
    const count = list.items.filter((i) => i.completed).length;
    const ok = await useConfirmStore.getState().confirm({
      title: t('todoListModal.removeDoneConfirm.title'),
      message: t('todoListModal.removeDoneConfirm.message', { count, name: list.name }),
      confirmLabel: t('todoListModal.removeDoneConfirm.confirmLabel'),
      variant: 'danger',
    });
    if (!ok) return;
    void write(null, listActionRequest(listId, 'clear-completed'));
  };

  const items = list?.items ?? [];
  const doneCount = items.filter((i) => i.completed).length;
  const openCount = items.length - doneCount;

  return (
    <CRUDModalShell
      title={t('todoListModal.title')}
      icon={<ListTodo className="h-4 w-4 text-hs-accent-hover" aria-hidden="true" />}
      subtitle={list ? t('todoListModal.itemCount', { open: openCount, done: doneCount }) : undefined}
      maxWidth="max-w-xl"
      hideFooter
      onClose={() => { flushName(); onClose(); }}
    >
      {loadError && (
        <div role="alert" className="mx-4 mt-3 rounded-lg border border-hs-danger/30 bg-hs-danger/10 px-3 py-2 text-xs text-hs-danger">
          {loadError}
        </div>
      )}
      {error && (
        <div role="alert" className="mx-4 mt-3 rounded-lg border border-hs-danger/30 bg-hs-danger/10 px-3 py-2 text-xs text-hs-danger">
          {error}
        </div>
      )}

      {!list ? (
        !loadError && (
          <div className="flex flex-1 min-h-0 items-center justify-center text-sm text-hs-text-faint">
            {tCore('loading')}
          </div>
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-hs-text-muted">{t('todoListModal.nameLabel')}</span>
              <input
                type="text"
                value={name}
                maxLength={TODO_LIMITS.maxListNameLength}
                onChange={(e) => setTypedName(e.target.value)}
                onBlur={flushName}
                className={MODAL_INPUT_CLASS}
              />
            </label>
          </div>

          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-3">
            {items.length === 0 && (
              <li className="py-6 text-center text-sm text-hs-text-faint">{t('todoListModal.empty')}</li>
            )}
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onToggle={toggleItem}
                onSaveText={saveItemText}
                onDelete={deleteItem}
              />
            ))}
          </ul>

          <div className="flex items-center gap-2 border-t border-hs-border-strong px-4 py-3">
            <input
              ref={addInputRef}
              type="text"
              value={draft}
              maxLength={TODO_LIMITS.maxItemTextLength}
              placeholder={t('todoListModal.addPlaceholder')}
              aria-label={tCore('actions.add')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addItem(); } }}
              className={MODAL_INPUT_CLASS}
              autoFocus
            />
            <Button variant="primary" size="sm" onClick={() => void addItem()} disabled={!draft.trim()}>
              {tCore('actions.add')}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-hs-border-strong px-5 py-3">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={uncheckAll} disabled={!loaded || doneCount === 0}>
            {t('todoListModal.uncheckAll')}
          </Button>
          <Button size="sm" onClick={() => void removeDone()} disabled={!loaded || doneCount === 0}>
            {t('todoListModal.removeDone')}
          </Button>
        </div>
        <Button size="sm" variant="primary" onClick={() => { flushName(); onClose(); }}>
          {t('modals.crud.done')}
        </Button>
      </div>
    </CRUDModalShell>
  );
}

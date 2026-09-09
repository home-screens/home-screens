'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ListTodo } from 'lucide-react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { displayCache } from '@/lib/display-cache';
import { todoListsUrl } from '@/lib/fetch-keys';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
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

type ListsResponse = { lists: TodoList[] };

/** A row's text field: quiet until focused, so the list reads as a list and not a form. */
const ROW_INPUT_CLASS =
  'w-full px-2 py-1 text-sm bg-transparent border border-transparent rounded-md focus:outline-none focus:border-hs-border-strong focus:bg-hs-input transition-colors';

/**
 * Send one write to the to-do API and hand back the lists it answers with.
 * A 4xx carries `{ error }` in plain language from the store's validation;
 * anything else (network, 500) becomes the generic save error. Rejects so
 * callers can show the message and leave their optimistic state alone.
 */
async function todoRequest(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, fallback = ''): Promise<TodoList[]> {
  const res = await editorFetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as (ListsResponse & { error?: string }) | null;
  if (!res.ok || !json?.lists) throw new Error(json?.error || fallback);
  displayCache.invalidate(todoListsUrl());
  return json.lists;
}

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
  const [editing, setEditing] = useState(false);

  // Text is local-first: the row keeps what was typed and the debounced save
  // catches up. A pending edit is flushed when the row unmounts (modal closed
  // or item removed); `onSaveText` skips items that no longer exist.
  const { flush, hasPending } = useDebouncedSave({
    values: [text],
    save: () => onSaveText(item.id, text),
    flushOnUnmount: true,
  });

  // Adopt the server's wording while this row is not being edited, so a
  // rename made on a phone shows here instead of sitting behind a stale
  // copy that the next blur would write back over it.
  useEffect(() => {
    if (!editing && !hasPending()) setText(item.text);
  }, [item.text, editing, hasPending]);

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
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
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

/**
 * Edits one shared to-do list in place: name, items, and the two bulk
 * actions. Every change goes straight to `/api/todo/lists` so the wall, the
 * phone and the editor preview all see it, and each response replaces the
 * local copy with server truth.
 */
export default function TodoListModal({ listId, onClose }: TodoListModalProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [list, setList] = useState<TodoList | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);
  // The latest list the modal knows about, for callbacks that outlive a render
  // (a row's unmount flush must not resurrect an item that was just removed).
  const listRef = useRef<TodoList | null>(null);
  listRef.current = list;
  // Only the most recently issued write may replace the local copy. Two
  // rapid writes can still reach the server in the other order, in which
  // case the response we keep predates the one we dropped; once every
  // request has settled after such a drop, the list is fetched afresh.
  const requestSeq = useRef(0);
  const inFlight = useRef(0);
  const droppedResponse = useRef(false);

  const listUrl = `${todoListsUrl()}/${encodeURIComponent(listId)}`;
  const saveFailed = t('common.saveError');

  useEffect(() => {
    editorFetch(todoListsUrl())
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ListsResponse>;
      })
      .then((data) => {
        const found = data.lists.find((l) => l.id === listId);
        if (!found) {
          setLoadError(t('todoListModal.listGone'));
          return;
        }
        setList(found);
        setName(found.name);
        setLoaded(true);
      })
      .catch((e) => {
        if (isSessionExpired(e)) return;
        setLoadError(t('todoListModal.loadError'));
      });
    // The list id is fixed for the life of the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  const adoptLists = useCallback((lists: TodoList[]): boolean => {
    const next = lists.find((l) => l.id === listId);
    if (!next) {
      setLoadError(t('todoListModal.listGone'));
      return false;
    }
    setList(next);
    setError(null);
    return true;
  }, [listId, t]);

  /**
   * Bring the local copy back in step with the server: after a dropped
   * out-of-order response, or after a write the server refused (the
   * optimistic change must not stand). The answer is adopted only if no
   * write started while it was on its way; otherwise it is stale by
   * definition and the next settle fetches again.
   */
  const reconcile = useCallback(() => {
    const seqAtStart = requestSeq.current;
    editorFetch(todoListsUrl())
      .then((res) => (res.ok ? (res.json() as Promise<ListsResponse>) : null))
      .then((data) => {
        if (!data) return;
        if (seqAtStart !== requestSeq.current) {
          droppedResponse.current = true;
          return;
        }
        adoptLists(data.lists);
      })
      .catch(() => { /* the next write or reopen brings the list back in step */ });
  }, [adoptLists]);

  /** Run one write and adopt its answer unless a later write has been sent since. */
  const write = useCallback(
    async (method: 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<boolean> => {
      const seq = ++requestSeq.current;
      inFlight.current += 1;
      try {
        const lists = await todoRequest(url, method, body, saveFailed);
        if (seq !== requestSeq.current) {
          droppedResponse.current = true;
          return true;
        }
        return adoptLists(lists);
      } catch (e) {
        if (isSessionExpired(e)) return false;
        setError(e instanceof Error && e.message ? e.message : saveFailed);
        // Whatever this write changed locally was refused: fetch the truth
        // once the other requests are done with it.
        droppedResponse.current = true;
        return false;
      } finally {
        inFlight.current -= 1;
        if (inFlight.current === 0 && droppedResponse.current) {
          droppedResponse.current = false;
          reconcile();
        }
      }
    },
    [adoptLists, reconcile, saveFailed],
  );

  // ── Name ──
  const { flush: flushName } = useDebouncedSave({
    values: [name],
    enabled: loaded,
    save: () => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === listRef.current?.name) return;
      return write('PATCH', listUrl, { name: trimmed });
    },
  });

  // ── Items ──
  const toggleItem = (itemId: string, completed: boolean) => {
    setList((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === itemId ? { ...i, completed } : i)) } : prev,
    );
    void write('PATCH', `${listUrl}/items/${encodeURIComponent(itemId)}`, { completed });
  };

  const saveItemText = (itemId: string, text: string) => {
    const current = listRef.current?.items.find((i) => i.id === itemId);
    const trimmed = text.trim();
    if (!current || !trimmed || trimmed === current.text) return;
    void write('PATCH', `${listUrl}/items/${encodeURIComponent(itemId)}`, { text: trimmed });
  };

  const deleteItem = (itemId: string) => {
    void write('DELETE', `${listUrl}/items/${encodeURIComponent(itemId)}`);
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
    const ok = await write('POST', `${listUrl}/items`, { text });
    if (!ok) setDraft((current) => current || text);
  };

  // ── Bulk actions ──
  const uncheckAll = () => {
    void write('PATCH', listUrl, { action: 'uncheck-all' });
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
    void write('PATCH', listUrl, { action: 'clear-completed' });
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

      {!loaded ? (
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
                onChange={(e) => setName(e.target.value)}
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

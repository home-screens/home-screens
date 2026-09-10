'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronUp, ListTodo, Plus, Settings } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { localISODate } from '@/lib/todo-due-labels';
import { TODO_LIMITS, type TodoList } from '@/types/todos';
import { MEMBER_COLORS } from '@/components/modules/chore-chart/types';
import { useTodoLists } from '../hooks/useTodoLists';
import ListsItemRow from './ListsItemRow';
import ListsItemSheet from './ListsItemSheet';
import { FamilySettingsView } from './SettingsSheet';
import { useFamilyData } from '@/hooks/useFamilyData';
import ListsListSheet, { weekdayNames } from './ListsListSheet';
import ListsNewListSheet from './ListsNewListSheet';
import ListsAddBar, { ADD_BAR_HEIGHT } from './ListsAddBar';
import { PRIMARY_BUTTON, SHEET_FIELD } from './lists-styles';

const DONE_COLLAPSED_KEY = 'hs-remote-todo-done-collapsed';

/** The first swatch no list is using yet, so new lists come out distinct. */
function nextListColor(lists: TodoList[]): string {
  const used = new Set(lists.map((l) => l.color));
  return MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[lists.length % MEMBER_COLORS.length];
}

function readCollapsed(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DONE_COLLAPSED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeCollapsed(next: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(DONE_COLLAPSED_KEY, JSON.stringify(next));
  } catch {
    /* private mode: the fold just does not stick */
  }
}

interface ListsTabProps {
  /** Held by RemoteClient so the choice survives a detour through another tab. */
  selectedListId: string | null;
  onSelectList: (id: string | null) => void;
}

/**
 * The /remote Lists tab: shared to-do lists from `data/todos.json`. Chips
 * pick a list, rows toggle on tap, the pencil opens the item sheet, the
 * gear opens the list sheet, and the add bar pinned above the tab bar is
 * the fast path for typing a run of items.
 */
export default function ListsTab({ selectedListId, onSelectList }: ListsTabProps) {
  const t = useTranslate('remote');
  const locale = useFormattingLocale();
  const api = useTodoLists({ selectedListId, onSelectList });
  const { lists, loaded, loadError, selectedList } = api;
  // The shared roster: a save on the Family screen publishes to this hook,
  // so the Who row and the row initials update without a reload.
  const { members } = useFamilyData();
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [listSheetOpen, setListSheetOpen] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);

  const todayISO = localISODate();

  const sensors = useSensors(
    // A small distance so a tap on the handle still counts as a tap, and a
    // hold on touch so a finger dragging the page past the handle scrolls.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const openItems = useMemo(() => selectedList?.items.filter((it) => !it.completed) ?? [], [selectedList]);
  const doneItems = useMemo(() => selectedList?.items.filter((it) => it.completed) ?? [], [selectedList]);
  const total = openItems.length + doneItems.length;
  const allDone = total > 0 && openItems.length === 0;
  const doneCollapsed = selectedList ? collapsed[selectedList.id] === true : false;

  const toggleDoneGroup = useCallback(() => {
    if (!selectedList) return;
    setCollapsed((prev) => {
      const next = { ...prev, [selectedList.id]: !(prev[selectedList.id] === true) };
      writeCollapsed(next);
      return next;
    });
  }, [selectedList]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!selectedList || !over || active.id === over.id) return;
      const openIds = openItems.map((it) => it.id);
      const activeOpen = openIds.includes(String(active.id));
      // Rows only move within their own group: an open item cannot be
      // dragged into Done, that is what the checkbox is for.
      if (activeOpen !== openIds.includes(String(over.id))) return;
      // Move the dragged item inside the stored order and leave everything
      // else where it is. Submitting [open..., done...] instead would
      // reshuffle a wall module that shows items in stored order.
      const all = selectedList.items.map((it) => it.id);
      const from = all.indexOf(String(active.id));
      const to = all.indexOf(String(over.id));
      if (from === -1 || to === -1) return;
      api.reorderItems(selectedList.id, arrayMove(all, from, to));
    },
    [api, selectedList, openItems],
  );

  const editingItem = editingItemId ? selectedList?.items.find((it) => it.id === editingItemId) ?? null : null;

  const openCount = (list: TodoList) => list.items.filter((it) => !it.completed).length;

  const repeatText = (list: TodoList): string | null => {
    if (list.repeat === 'daily') return t('lists.allDone.daily');
    if (list.repeat === 'weekly') return t('lists.allDone.weekly', { day: weekdayNames(locale)[list.repeatDay ?? 0] });
    return null;
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 12px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--hs-text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
          {t('lists.title')}
        </h2>
      </div>

      {!loaded && loadError ? (
        <div className="mt-3 p-4 rounded-[14px] bg-hs-card border border-hs-border-strong" data-testid="todo-load-error">
          <p className="text-[13px] text-hs-text-faint">{t('lists.loadError')}</p>
          <button
            type="button"
            onClick={() => void api.retry()}
            className="mt-3 min-h-[40px] px-4 rounded-xl bg-hs-hover text-hs-text-primary text-[13px] font-semibold active:scale-[0.97]"
          >
            {t('lists.retry')}
          </button>
        </div>
      ) : !loaded ? null : lists.length === 0 ? (
        <FirstListCard onCreate={(name) => api.createList(name, nextListColor(lists))} />
      ) : (
        <>
          <div
            style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}
            role="group"
            aria-label={t('lists.chipsLabel')}
          >
            {lists.map((list) => {
              const on = selectedList?.id === list.id;
              return (
                <button
                  key={list.id}
                  type="button"
                  data-testid="todo-list-chip"
                  aria-pressed={on}
                  onClick={() => onSelectList(list.id)}
                  className="press-scale-sm"
                  style={{
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 36,
                    padding: '0 12px 0 10px',
                    borderRadius: 18,
                    border: `1px solid ${on ? 'var(--hs-accent)' : 'var(--hs-border-strong)'}`,
                    background: on ? 'var(--hs-accent)' : 'var(--hs-bg-panel)',
                    color: on ? '#fff' : 'var(--hs-text-body)',
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: list.color ?? 'var(--hs-text-faint)', display: 'block', flex: 'none' }} />
                  {list.name}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 8,
                      background: on ? 'rgba(255,255,255,0.22)' : 'var(--hs-bg-card)',
                      color: on ? '#fff' : 'var(--hs-text-muted)',
                    }}
                  >
                    {openCount(list)}
                  </span>
                </button>
              );
            })}
            {lists.length < TODO_LIMITS.maxLists && (
              <button
                type="button"
                aria-label={t('lists.newList.title')}
                onClick={() => setNewListOpen(true)}
                className="press-scale-sm"
                style={{
                  flex: 'none',
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  border: '1px solid var(--hs-border-strong)',
                  background: 'var(--hs-bg-panel)',
                  color: 'var(--hs-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Plus size={20} aria-hidden="true" />
              </button>
            )}
          </div>

          {selectedList && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span
                  data-testid="todo-summary"
                  style={{ fontSize: 14, fontWeight: 600, color: allDone ? 'var(--hs-success)' : 'var(--hs-text-body)' }}
                >
                  {total === 0
                    ? t('lists.summary.empty')
                    : t('lists.summary.progress', { done: doneItems.length, total })}
                </span>
                <button
                  type="button"
                  aria-label={t('lists.settingsButton')}
                  onClick={() => setListSheetOpen(true)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: '1px solid var(--hs-border)',
                    background: 'var(--hs-bg-panel)',
                    color: 'var(--hs-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Settings size={18} aria-hidden="true" />
                </button>
              </div>
              <div style={{ height: 6, background: 'var(--hs-border)', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }} aria-hidden="true">
                <div
                  style={{
                    height: '100%',
                    borderRadius: 3,
                    width: total > 0 ? `${(doneItems.length / total) * 100}%` : '0%',
                    background: 'var(--hs-success)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              {total === 0 && (
                <div style={{ textAlign: 'center', padding: '64px 24px 0' }}>
                  <ListTodo size={44} style={{ color: 'var(--hs-border-strong)', margin: '0 auto 14px' }} aria-hidden="true" />
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--hs-text-body)' }}>{t('lists.empty.title')}</div>
                  <div style={{ fontSize: 14, color: 'var(--hs-text-faint)', marginTop: 6, lineHeight: 1.45 }}>{t('lists.empty.body')}</div>
                </div>
              )}

              {allDone && (
                <div data-testid="todo-all-done" style={{ textAlign: 'center', padding: '22px 0 8px' }}>
                  <div
                    aria-hidden="true"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: 'var(--hs-success)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 30,
                      fontWeight: 800,
                      margin: '0 auto 10px',
                    }}
                  >
                    ✓
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--hs-text-primary)' }}>{t('lists.allDone.title')}</div>
                  {repeatText(selectedList) && (
                    <div style={{ fontSize: 13, color: 'var(--hs-text-faint)', marginTop: 4 }}>{repeatText(selectedList)}</div>
                  )}
                </div>
              )}

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={openItems.map((it) => it.id)} strategy={verticalListSortingStrategy}>
                  {openItems.map((item) => (
                    <ListsItemRow
                      key={item.id}
                      item={item}
                      todayISO={todayISO}
                      members={membersById}
                      onToggle={() => api.toggleItem(selectedList.id, item.id)}
                      onEdit={() => setEditingItemId(item.id)}
                    />
                  ))}
                </SortableContext>

                {doneItems.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={toggleDoneGroup}
                      aria-expanded={!doneCollapsed}
                      data-testid="todo-done-group"
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        minHeight: 44,
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--hs-text-faint)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        margin: '6px 0 2px',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ flex: 1, textAlign: 'left' }}>{t('lists.doneGroup', { count: doneItems.length })}</span>
                      {doneCollapsed ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                    </button>
                    {!doneCollapsed && (
                      <SortableContext items={doneItems.map((it) => it.id)} strategy={verticalListSortingStrategy}>
                        {doneItems.map((item) => (
                          <ListsItemRow
                            key={item.id}
                            item={item}
                            todayISO={todayISO}
                            members={membersById}
                            onToggle={() => api.toggleItem(selectedList.id, item.id)}
                            onEdit={() => setEditingItemId(item.id)}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </>
                )}
              </DndContext>

              {/* Room for the add bar pinned above the tab bar. */}
              <div style={{ height: ADD_BAR_HEIGHT }} />

              <ListsAddBar listName={selectedList.name} onAdd={(text) => api.addItem(selectedList.id, text)} />
            </>
          )}
        </>
      )}

      {editingItem && selectedList && (
        <ListsItemSheet
          key={editingItem.id}
          item={editingItem}
          todayISO={todayISO}
          members={members}
          onAddPeople={() => setFamilyOpen(true)}
          onSave={(patch) => {
            api.updateItem(selectedList.id, editingItem.id, patch);
            setEditingItemId(null);
          }}
          onDelete={() => {
            api.deleteItem(selectedList.id, editingItem.id);
            setEditingItemId(null);
          }}
          onClose={() => setEditingItemId(null)}
        />
      )}
      {/* Over the item sheet, so the sheet is still there on the way back. */}
      {familyOpen && <FamilySettingsView zIndex={300} onBack={() => setFamilyOpen(false)} />}

      {listSheetOpen && selectedList && (
        <ListsListSheet
          key={selectedList.id}
          list={selectedList}
          onSave={(patch) => api.updateList(selectedList.id, patch)}
          onAction={(action) => api.listAction(selectedList.id, action)}
          onDelete={() => api.deleteList(selectedList.id)}
          onClose={() => setListSheetOpen(false)}
        />
      )}

      {newListOpen && (
        <ListsNewListSheet defaultColor={nextListColor(lists)} onCreate={api.createList} onClose={() => setNewListOpen(false)} />
      )}
    </div>
  );
}

/** Shown instead of the chips when the store is empty. */
function FirstListCard({ onCreate }: { onCreate: (name: string) => Promise<boolean> }) {
  const t = useTranslate('remote');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    const ok = await onCreate(clean);
    setBusy(false);
    if (ok) setName('');
  };

  return (
    <form
      data-testid="todo-first-list"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      style={{
        background: 'var(--hs-bg-panel)',
        border: '1px solid var(--hs-border)',
        borderRadius: 16,
        padding: 16,
        marginTop: 8,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--hs-text-primary)', marginBottom: 12 }}>
        {t('lists.firstList.title')}
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={TODO_LIMITS.maxListNameLength}
        placeholder={t('lists.firstList.placeholder')}
        aria-label={t('lists.listSheet.nameLabel')}
        style={SHEET_FIELD}
      />
      <button type="submit" className="press-btn" style={PRIMARY_BUTTON} disabled={!name.trim() || busy}>
        {t('lists.newList.submit')}
      </button>
      <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 10, lineHeight: 1.45 }}>
        {t('lists.firstList.body')}
      </div>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { TODO_LIMITS, type TodoList, type TodoRepeat } from '@/types/todos';
import { MEMBER_COLORS } from '@/components/modules/chore-chart/types';
import { SELECT_STYLE } from './chore-form-styles';
import BottomSheet from './BottomSheet';
import ConfirmSheet from './ConfirmSheet';
import { shareOrCopyText } from './share-text';
import {
  DANGER_BUTTON,
  GHOST_BUTTON,
  HELPER_TEXT,
  PRIMARY_BUTTON,
  SEGMENT_ROW,
  SHEET_FIELD,
  SHEET_LABEL,
  segmentStyle,
  swatchStyle,
} from './lists-styles';
import type { ListPatch, TodoListAction } from '../hooks/useTodoLists';

interface ListsListSheetProps {
  list: TodoList;
  onSave: (patch: ListPatch) => Promise<unknown>;
  onAction: (action: TodoListAction) => void;
  onDelete: () => Promise<unknown>;
  onClose: () => void;
}

/** Sunday-first weekday names in the household's formatting locale. */
export function weekdayNames(locale: string): string[] {
  // 7 Jan 2024 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: 'long' }));
}

/** The sheet behind the gear: rename, colour, repeat, tidy up, share, delete. */
export default function ListsListSheet({ list, onSave, onAction, onDelete, onClose }: ListsListSheetProps) {
  const t = useTranslate('remote');
  const locale = useFormattingLocale();
  const [name, setName] = useState(list.name);
  const [color, setColor] = useState(list.color ?? '');
  const [repeat, setRepeat] = useState<TodoRepeat>(list.repeat);
  const [repeatDay, setRepeatDay] = useState(list.repeatDay ?? 0);
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const days = weekdayNames(locale);

  const save = async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    const patch: ListPatch = { name: clean, repeat };
    if (color) patch.color = color;
    if (repeat === 'weekly') patch.repeatDay = repeatDay;
    // Whose midnight "start fresh" means: this phone is standing in the
    // household, the hub may be on UTC.
    patch.timezone = repeat === 'never' ? '' : Intl.DateTimeFormat().resolvedOptions().timeZone;
    await onSave(patch);
    setBusy(false);
    onClose();
  };

  const share = async () => {
    const open = list.items.filter((it) => !it.completed).map((it) => it.text);
    const body = open.length > 0 ? open.join('\n') : t('lists.share.nothingOpen');
    const outcome = await shareOrCopyText(`${list.name}\n\n${body}`);
    if (outcome !== 'copied') return;
    setShareState('copied');
    setTimeout(() => setShareState('idle'), 2000);
  };

  const repeats: Array<{ id: TodoRepeat; label: string }> = [
    { id: 'never', label: t('lists.listSheet.repeatNever') },
    { id: 'daily', label: t('lists.listSheet.repeatDaily') },
    { id: 'weekly', label: t('lists.listSheet.repeatWeekly') },
  ];

  return (
    <BottomSheet title={list.name} onClose={onClose} testId="todo-list-sheet">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <span style={{ ...SHEET_LABEL, marginTop: 0 }}>{t('lists.listSheet.nameLabel')}</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={TODO_LIMITS.maxListNameLength}
          aria-label={t('lists.listSheet.nameLabel')}
          style={SHEET_FIELD}
        />

        <span style={SHEET_LABEL} id="todo-colour-label">{t('lists.listSheet.colourLabel')}</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} role="group" aria-labelledby="todo-colour-label">
          {MEMBER_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              aria-label={t('lists.colourSwatch', { number: i + 1 })}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              style={swatchStyle(c, color === c)}
            />
          ))}
        </div>

        <span style={SHEET_LABEL} id="todo-repeat-label">{t('lists.listSheet.repeatLabel')}</span>
        <div style={SEGMENT_ROW} role="group" aria-labelledby="todo-repeat-label">
          {repeats.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={repeat === r.id}
              onClick={() => setRepeat(r.id)}
              style={segmentStyle(repeat === r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        {repeat === 'weekly' && (
          <select
            value={repeatDay}
            onChange={(e) => setRepeatDay(Number(e.target.value))}
            aria-label={t('lists.listSheet.repeatDayLabel')}
            style={{ ...SELECT_STYLE, marginTop: 8 }}
          >
            {days.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        )}
        <div style={HELPER_TEXT}>{t('lists.listSheet.repeatHelp')}</div>

        <span style={SHEET_LABEL}>{t('lists.listSheet.tidyLabel')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="press-scale" style={{ ...GHOST_BUTTON, marginTop: 0, flex: 1 }} onClick={() => onAction('uncheck-all')}>
            {t('lists.listSheet.uncheckAll')}
          </button>
          <button type="button" className="press-scale" style={{ ...GHOST_BUTTON, marginTop: 0, flex: 1 }} onClick={() => onAction('clear-completed')}>
            {t('lists.listSheet.removeDone')}
          </button>
          <button
            type="button"
            className="press-scale"
            style={{ ...GHOST_BUTTON, marginTop: 0, flex: 1, color: shareState === 'copied' ? 'var(--hs-success)' : GHOST_BUTTON.color }}
            onClick={() => void share()}
          >
            {shareState === 'copied' ? t('lists.share.copied') : t('lists.share.button')}
          </button>
        </div>

        <button type="submit" className="press-btn" style={{ ...PRIMARY_BUTTON, marginTop: 18 }} disabled={!name.trim() || busy}>
          {t('lists.listSheet.save')}
        </button>
        <button type="button" className="press-scale" style={DANGER_BUTTON} onClick={() => setConfirmDelete(true)}>
          {t('lists.listSheet.delete')}
        </button>
      </form>

      {confirmDelete && (
        <ConfirmSheet
          zIndex={210}
          title={t('lists.listSheet.confirmDelete.title', { name: list.name })}
          description={t('lists.listSheet.confirmDelete.description')}
          confirmLabel={t('lists.listSheet.delete')}
          onConfirm={() => {
            setConfirmDelete(false);
            // Close first: the list is removed from the tab optimistically,
            // so a sheet left open until the request lands would re-key to
            // whichever list is selected next, with a live Delete button.
            onClose();
            void onDelete();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </BottomSheet>
  );
}

'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import { TODO_LIMITS } from '@/types/todos';
import { MEMBER_COLORS } from '@/components/modules/chore-chart/types';
import BottomSheet from './BottomSheet';
import { PRIMARY_BUTTON, SHEET_FIELD, SHEET_LABEL, swatchStyle } from './lists-styles';

interface ListsNewListSheetProps {
  /** Swatch to start on: the first one no other list is using. */
  defaultColor: string;
  onCreate: (name: string, color?: string) => Promise<boolean>;
  onClose: () => void;
}

/** The small sheet behind the + chip: a name and a colour. */
export default function ListsNewListSheet({ defaultColor, onCreate, onClose }: ListsNewListSheetProps) {
  const t = useTranslate('remote');
  const [name, setName] = useState('');
  const [color, setColor] = useState(defaultColor);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    const ok = await onCreate(clean, color);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <BottomSheet title={t('lists.newList.title')} onClose={onClose} testId="todo-new-list-sheet">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={TODO_LIMITS.maxListNameLength}
          placeholder={t('lists.newList.placeholder')}
          aria-label={t('lists.listSheet.nameLabel')}
          autoFocus
          style={SHEET_FIELD}
        />
        <span style={SHEET_LABEL} id="todo-new-colour-label">{t('lists.listSheet.colourLabel')}</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} role="group" aria-labelledby="todo-new-colour-label">
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
        <button type="submit" className="press-btn" style={{ ...PRIMARY_BUTTON, marginTop: 22 }} disabled={!name.trim() || busy}>
          {t('lists.newList.submit')}
        </button>
      </form>
    </BottomSheet>
  );
}

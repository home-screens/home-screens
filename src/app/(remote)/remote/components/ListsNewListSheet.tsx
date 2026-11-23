'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import { TODO_LIMITS } from '@/types/todos';
import BottomSheet from './BottomSheet';
import ColorSwatchRow from './ColorSwatchRow';
import { SHEET_FIELD, SHEET_LABEL } from './remote-styles';
import PrimaryButton from './PrimaryButton';

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
        <ColorSwatchRow value={color} onChange={setColor} labelledBy="todo-new-colour-label" />
        <PrimaryButton type="submit" style={{ marginTop: 22 }} disabled={!name.trim()} busy={busy}>
          {t('lists.newList.submit')}
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

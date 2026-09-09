'use client';

import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { TODO_LIMITS } from '@/types/todos';

interface ListsAddBarProps {
  listName: string;
  onAdd: (text: string) => void;
}

/** Height of the bar itself, without the safe area. The tab pads for it. */
export const ADD_BAR_HEIGHT = 68;

/**
 * The fast path: type, return, type the next one. Pinned above the tab bar
 * (64px plus the safe area) and keeps focus after each add so a whole
 * grocery run can be typed without touching the field again. Options live
 * in the item sheet, not here.
 */
export default function ListsAddBar({ listName, onAdd }: ListsAddBarProps) {
  const t = useTranslate('remote');
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const clean = text.trim();
    if (!clean) return;
    onAdd(clean);
    setText('');
    inputRef.current?.focus();
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        zIndex: 40,
        borderTop: '1px solid var(--hs-border-subtle)',
        background: 'var(--hs-bg-body)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ width: '100%', maxWidth: 640, display: 'flex', gap: 8, padding: '10px 16px', height: ADD_BAR_HEIGHT }}
      >
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={TODO_LIMITS.maxItemTextLength}
          placeholder={t('lists.addBar.placeholder', { list: listName })}
          aria-label={t('lists.addBar.placeholder', { list: listName })}
          data-testid="todo-add-input"
          enterKeyHint="done"
          autoComplete="off"
          style={{
            flex: 1,
            minWidth: 0,
            height: 48,
            borderRadius: 12,
            background: 'var(--hs-bg-input)',
            border: '1px solid var(--hs-border-strong)',
            padding: '0 16px',
            fontSize: 16,
            color: 'var(--hs-text-primary)',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          className="press-btn"
          aria-label={t('lists.addBar.submit')}
          style={{
            width: 48,
            height: 48,
            flex: 'none',
            borderRadius: 12,
            background: 'var(--hs-accent)',
            color: '#fff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Plus size={24} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

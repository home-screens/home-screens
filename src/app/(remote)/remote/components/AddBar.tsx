'use client';

import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Plus } from 'lucide-react';

interface AddBarProps {
  /** The field's placeholder, also its accessible name. */
  placeholder: string;
  /** Accessible name of the plus button. */
  buttonLabel: string;
  maxLength: number;
  /** Resolves to false when the text could not be saved. */
  onAdd: (text: string) => Promise<boolean>;
  /**
   * When set, the plus opens a fuller form instead of saving, handed
   * whatever was typed, and so does Return on an empty field. Return with
   * text in the field still saves straight away (the Notes tab).
   */
  onExpand?: (text: string) => void;
  /** Hold the text outside, so a caller can hand back a draft its form did not use. */
  value?: string;
  onValueChange?: Dispatch<SetStateAction<string>>;
  enterKeyHint?: 'done' | 'send';
  inputTestId: string;
  buttonTestId?: string;
}

/** Height of the bar itself, without the safe area. A tab pads for it. */
export const ADD_BAR_HEIGHT = 68;

/**
 * The fast path: type, return, type the next one. Pinned above the tab bar
 * (64px plus the safe area) and keeps focus after each add so a whole
 * grocery run can be typed without touching the field again. Options live
 * in the tab's sheet, not here.
 *
 * The field clears at once, for the next entry. Text that then fails to save
 * comes back into it (unless something newer is already being typed), so a
 * dropped connection never costs what was typed.
 */
export default function AddBar({
  placeholder,
  buttonLabel,
  maxLength,
  onAdd,
  onExpand,
  value,
  onValueChange,
  enterKeyHint = 'done',
  inputTestId,
  buttonTestId,
}: AddBarProps) {
  const [ownText, setOwnText] = useState('');
  const text = value ?? ownText;
  const setText = onValueChange ?? setOwnText;
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const clean = text.trim();
    if (!clean) {
      onExpand?.('');
      return;
    }
    void onAdd(clean).then((saved) => {
      if (!saved) setText((now) => (now.trim() ? now : clean));
    });
    setText('');
    inputRef.current?.focus();
  };

  const expand = () => {
    onExpand?.(text.trim() ? text : '');
    setText('');
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
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={placeholder}
          data-testid={inputTestId}
          enterKeyHint={enterKeyHint}
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
          type={onExpand ? 'button' : 'submit'}
          onClick={onExpand ? expand : undefined}
          className="press-btn"
          aria-label={buttonLabel}
          data-testid={buttonTestId}
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

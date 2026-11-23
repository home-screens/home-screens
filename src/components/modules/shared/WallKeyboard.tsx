'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocale, useTranslate } from '@/i18n';
import { useInteractionHold } from '@/lib/interaction-hold';
import {
  WALL_KEYBOARD_NUMBER_ROWS,
  shiftLetter,
  wallKeyboardAccents,
  wallKeyboardColumns,
  wallKeyboardLayout,
  type WallKeyboardKind,
} from '@/lib/wall-keyboard';
import { useAutoClose } from './useAutoClose';
import { wallPressProps } from './wallPress';

/** A keyboard nobody has pressed for this long closes, so the screen can move on. */
export const WALL_KEYBOARD_IDLE_MS = 60_000;

const noIdle = () => {};

export interface WallKeyboardProps {
  /** A key as it is drawn: a capital while Shift is lit, a digit or mark from the 123 page, or a space. */
  onKey: (key: string) => void;
  onDelete: () => void;
  /** The action key (Done, Add). */
  onAction: () => void;
  /**
   * Nobody pressed a key for a minute. Given by a keyboard that stands alone
   * (the recipe search). Left out inside a sheet that closes itself: the sheet
   * counts every touch on it, keys included, and a second minute counted here
   * from the last key would close it under a finger on anything else.
   */
  onIdle?: () => void;
  /**
   * `search`: letters only, for the recipe search. `text`: Shift and a 123
   * page, for words someone will read (a list item, an event title).
   */
  kind?: WallKeyboardKind;
  /** Shift is lit (`text` only): the letters show, and type, as capitals. `useWallTyping` decides. */
  shift?: boolean;
  onShift?: () => void;
  /** The action key's word; Done when not given. */
  actionLabel?: string;
  /** Drawn before the action's word (the + of Add). */
  actionIcon?: ReactNode;
  /** Nothing to act on yet (nothing typed): the action key is drawn faint and does nothing. */
  actionDisabled?: boolean;
  /**
   * Something is open over the keyboard (a recipe card), so nobody can press
   * a key: the minute stops, and starts again in full once it closes.
   */
  paused?: boolean;
  /** Authored pixels (at 1080 wide) to this surface's pixels. */
  P: (n: number) => number;
  /** The widest the keys may spread, in this surface's pixels (a landscape wall keeps them together). */
  maxWidth?: number;
  /** Key height in authored pixels: 104 on a portrait wall, 78 on a landscape one. */
  keyHeight?: number;
  /**
   * Changing it puts the keyboard back on its letters: the next thing typed
   * starts a fresh line (`useWallTyping().round`, which counts each clear).
   * Within one line the 123 page stays where it is put.
   */
  round?: number;
}

/**
 * The wall's own keyboard. A Pi kiosk has no on-screen keyboard of its own,
 * so this draws the keys in the hub's language (`wallKeyboardLayout`): the
 * letters with delete, space and an action key, plus (for `text`) Shift left
 * of the last letter row, a row of the language's accented letters on top
 * where it has any, and a 123 page of digits and marks behind the key bottom
 * left. The page stays where it is put, so a space after a number does
 * not flip back to the letters. Colours come from the `--wt-*` variables
 * (`wallTypingVars`) its opener sets. While it is open the screen holds still
 * and a sideways flick does not change screens; a minute without a key
 * closes it (`onIdle`), unless the sheet it sits in does its own closing.
 */
export function WallKeyboard({
  onKey, onDelete, onAction, onIdle, kind = 'search', shift = false, onShift, actionLabel, actionIcon, actionDisabled = false,
  paused = false, P, maxWidth, keyHeight = 104, round = 0,
}: WallKeyboardProps) {
  const t = useTranslate('modules');
  const locale = useLocale();
  const layout = useMemo(() => wallKeyboardLayout(locale), [locale]);
  const columns = wallKeyboardColumns(layout, kind);
  const [pages, setPages] = useState<{ page: 'letters' | 'numbers'; round: number }>({ page: 'letters', round });
  // A fresh line (the box emptied after Add) starts on the letters again.
  if (pages.round !== round) setPages({ page: 'letters', round });
  const page = pages.round === round ? pages.page : 'letters';
  const setPage = (next: 'letters' | 'numbers') => setPages({ page: next, round });
  useInteractionHold();
  const pressed = useAutoClose(onIdle ?? noIdle, WALL_KEYBOARD_IDLE_MS, { paused: paused || !onIdle });

  const gap = P(12);
  // One key's width; percentages resolve against each row, which spans the keyboard.
  const unit = `((100% - ${(columns - 1) * gap}px) / ${columns})`;
  const width = (keys: number) => `calc(${unit} * ${keys} + ${gap * Math.max(0, Math.ceil(keys) - 1)}px)`;
  const keyStyle = (keys: number, extra?: CSSProperties): CSSProperties => ({
    width: width(keys), height: P(keyHeight), flexShrink: 0, border: 0, borderRadius: P(18),
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: P(10),
    background: 'var(--wt-surface)', color: 'var(--wt-text)', boxShadow: `0 ${P(3)}px 0 var(--wt-border)`,
    font: 'inherit', fontSize: P(40), fontWeight: 500, cursor: 'pointer', padding: 0, touchAction: 'manipulation',
    ...extra,
  });
  const fnStyle = (keys: number, extra?: CSSProperties) =>
    keyStyle(keys, { background: 'var(--wt-bg)', color: 'var(--wt-text-2)', fontSize: P(28), fontWeight: 600, ...extra });
  const press = (fn: () => void) => () => { pressed(); fn(); };
  const row: CSSProperties = { display: 'flex', justifyContent: 'center', gap };
  const text = kind === 'text';
  const actionWords = actionLabel ?? t('wallKeyboard.doneKey');
  const numbers = text && page === 'numbers';

  const charKeys = (chars: string) => [...chars].map((char) => {
    const shown = text && !numbers && shift ? shiftLetter(char, locale) : char;
    return (
      <button key={char} type="button" {...wallPressProps} data-key={shown} onClick={press(() => onKey(shown))} style={keyStyle(1)}>
        {shown}
      </button>
    );
  });
  const deleteButton = (keys: number) => (
    <button
      type="button"
      {...wallPressProps}
      data-key="delete"
      aria-label={t('wallKeyboard.deleteKey')}
      onClick={press(onDelete)}
      style={fnStyle(keys)}
    >
      <svg viewBox="0 0 24 24" width={P(42)} height={P(42)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
        <path d="m12 9 6 6" />
        <path d="m18 9-6 6" />
      </svg>
    </button>
  );
  const shiftButton = (
    <button
      type="button"
      {...wallPressProps}
      data-key="shift"
      aria-label={t('wallKeyboard.shiftKey')}
      aria-pressed={shift}
      onClick={press(() => onShift?.())}
      style={fnStyle(1.5, shift ? { background: 'color-mix(in srgb, var(--wt-accent) 22%, var(--wt-surface))', color: 'var(--wt-accent)' } : undefined)}
    >
      <svg viewBox="0 0 24 24" width={P(40)} height={P(40)} fill={shift ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18v-6H5l7-7 7 7h-4v6H9z" />
      </svg>
    </button>
  );

  // Letter rows, or the 123 page's rows; delete closes the last one.
  const charRows = numbers ? WALL_KEYBOARD_NUMBER_ROWS : layout.rows;
  const last = charRows.length - 1;
  // The language's accented letters, over both pages so the sheet keeps its
  // height when the page changes. Shift makes capitals of them on the letters.
  const accents = wallKeyboardAccents(layout, kind);

  return (
    <div
      data-testid="wall-keyboard"
      data-kind={kind}
      data-page={text ? page : undefined}
      style={{
        background: 'color-mix(in srgb, var(--wt-text) 5%, var(--wt-bg))', borderTop: '1px solid var(--wt-border)',
        boxShadow: '0 -18px 40px rgba(0,0,0,0.08)', padding: `${P(22)}px ${P(22)}px ${P(28)}px`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: P(14), maxWidth, margin: '0 auto' }}>
        {accents && <div data-row="accents" style={row}>{charKeys(accents)}</div>}
        {charRows.map((chars, i) => (
          <div key={chars} style={row}>
            {i === last && text && !numbers && shiftButton}
            {charKeys(chars)}
            {i === last && deleteButton(text ? 1.5 : 1.6)}
          </div>
        ))}
        <div style={row}>
          {text && (
            <button
              type="button"
              {...wallPressProps}
              data-key={numbers ? 'letters' : 'numbers'}
              aria-label={t(numbers ? 'wallKeyboard.lettersAria' : 'wallKeyboard.numbersAria')}
              onClick={press(() => setPage(numbers ? 'letters' : 'numbers'))}
              style={fnStyle(1.5)}
            >
              {t(numbers ? 'wallKeyboard.lettersKey' : 'wallKeyboard.numbersKey')}
            </button>
          )}
          <button type="button" {...wallPressProps} data-key="space" onClick={press(() => onKey(' '))} style={keyStyle(text ? 5.5 : 6, { fontSize: P(28), color: 'var(--wt-text-3)' })}>
            {t('wallKeyboard.spaceKey')}
          </button>
          <button
            type="button"
            {...wallPressProps}
            data-key="action"
            aria-disabled={actionDisabled || undefined}
            // A faint key still counts as a touch for the minute, but acts on nothing.
            onClick={press(() => { if (!actionDisabled) onAction(); })}
            style={keyStyle(text ? 3 : 2.4, {
              background: 'var(--wt-accent)', color: 'var(--wt-on-accent)', fontWeight: 700,
              // A long word ("Hinzufügen") steps down a size and keeps a margin, rather than touching the key's edges.
              fontSize: P(actionWords.length > 8 ? 27 : 32), padding: `0 ${P(12)}px`, whiteSpace: 'nowrap',
              boxShadow: `0 ${P(3)}px 0 color-mix(in srgb, var(--wt-accent) 70%, #000)`,
              opacity: actionDisabled ? 0.38 : 1,
            })}
          >
            {actionIcon}
            {actionWords}
          </button>
        </div>
      </div>
    </div>
  );
}

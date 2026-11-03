'use client';

import { useMemo, type CSSProperties } from 'react';
import { useLocale, useTranslate } from '@/i18n';
import { useInteractionHold } from '@/lib/interaction-hold';
import { wallKeyboardColumns, wallKeyboardLayout } from '@/lib/wall-keyboard';
import { useAutoClose } from './useAutoClose';
import { wallPressProps } from './wallPress';

/** A keyboard nobody has pressed for this long closes, so the screen can move on. */
export const WALL_KEYBOARD_IDLE_MS = 60_000;

interface WallKeyboardProps {
  onKey: (key: string) => void;
  onDelete: () => void;
  onDone: () => void;
  /** Nobody pressed a key for a minute. */
  onIdle: () => void;
  /**
   * Something is open over the keyboard (a recipe card), so nobody can press
   * a key: the minute stops, and starts again in full once it closes.
   */
  paused?: boolean;
  /** Authored pixels (at 1080 wide) to this surface's pixels. */
  P: (n: number) => number;
  /** The widest the keys may spread, in this surface's pixels (a landscape wall keeps them together). */
  maxWidth?: number;
  /** Key height in authored pixels. */
  keyHeight?: number;
}

/**
 * The wall's own keyboard, for searching recipes. A Pi kiosk has no on-screen
 * keyboard of its own and the wall only types a few letters, so this draws
 * letters in the hub's language (`wallKeyboardLayout`), space, delete and
 * Done, in the full-screen theme (`--fmp-*`). While it is open the screen
 * holds still and a sideways flick does not change screens; a minute without
 * a key closes it.
 */
export function WallKeyboard({ onKey, onDelete, onDone, onIdle, paused = false, P, maxWidth, keyHeight = 104 }: WallKeyboardProps) {
  const t = useTranslate('modules');
  const locale = useLocale();
  const layout = useMemo(() => wallKeyboardLayout(locale), [locale]);
  const columns = wallKeyboardColumns(layout);
  useInteractionHold();
  const pressed = useAutoClose(onIdle, WALL_KEYBOARD_IDLE_MS, { paused });

  const gap = P(12);
  // One key's width; percentages resolve against each row, which spans the keyboard.
  const unit = `((100% - ${(columns - 1) * gap}px) / ${columns})`;
  const width = (keys: number) => `calc(${unit} * ${keys} + ${gap * Math.max(0, Math.ceil(keys) - 1)}px)`;
  const keyStyle = (keys: number, extra?: CSSProperties): CSSProperties => ({
    width: width(keys), height: P(keyHeight), flexShrink: 0, border: 0, borderRadius: P(18),
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--fmp-surface)', color: 'var(--fmp-text)', boxShadow: `0 ${P(3)}px 0 var(--fmp-border)`,
    font: 'inherit', fontSize: P(40), fontWeight: 500, cursor: 'pointer', padding: 0, touchAction: 'manipulation',
    ...extra,
  });
  const press = (fn: () => void) => () => { pressed(); fn(); };
  const key = wallPressProps;
  const row: CSSProperties = { display: 'flex', justifyContent: 'center', gap };

  return (
    <div
      data-testid="wall-keyboard"
      style={{
        background: 'color-mix(in srgb, var(--fmp-text) 5%, var(--fmp-bg))', borderTop: '1px solid var(--fmp-border)',
        boxShadow: '0 -18px 40px rgba(0,0,0,0.08)', padding: `${P(22)}px ${P(22)}px ${P(28)}px`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: P(14), maxWidth, margin: '0 auto' }}>
        {layout.rows.map((letters, i) => (
          <div key={letters} style={row}>
            {[...letters].map((letter) => (
              <button key={letter} type="button" {...key} data-key={letter} onClick={press(() => onKey(letter))} style={keyStyle(1)}>
                {letter}
              </button>
            ))}
            {i === layout.rows.length - 1 && (
              <button
                type="button"
                {...key}
                data-key="delete"
                aria-label={t('meal-planner.recipeBook.deleteKey')}
                onClick={press(onDelete)}
                style={keyStyle(1.6, { background: 'var(--fmp-bg)', color: 'var(--fmp-text-2)' })}
              >
                <svg viewBox="0 0 24 24" width={P(42)} height={P(42)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                  <path d="m12 9 6 6" />
                  <path d="m18 9-6 6" />
                </svg>
              </button>
            )}
          </div>
        ))}
        <div style={row}>
          <button type="button" {...key} data-key="space" onClick={press(() => onKey(' '))} style={keyStyle(6, { fontSize: P(28), color: 'var(--fmp-text-3)' })}>
            {t('meal-planner.recipeBook.spaceKey')}
          </button>
          <button
            type="button"
            {...key}
            data-key="done"
            onClick={press(onDone)}
            style={keyStyle(2.4, {
              background: 'var(--fmp-accent)', color: 'var(--fmp-on-accent, #fff)', fontWeight: 700, fontSize: P(32),
              boxShadow: `0 ${P(3)}px 0 color-mix(in srgb, var(--fmp-accent) 70%, #000)`,
            })}
          >
            {t('meal-planner.recipeBook.doneKey')}
          </button>
        </div>
      </div>
    </div>
  );
}

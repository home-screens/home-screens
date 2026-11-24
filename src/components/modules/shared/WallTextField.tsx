'use client';

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useTranslate } from '@/i18n';

type Px = (n: number) => number;

/**
 * The blinking line where the next letter goes. The wall types into drawn
 * words, not a real input, so Chromium never raises a keyboard of its own and
 * nothing can lose focus; this is the only sign of where typing lands.
 */
export function WallCaret({ P }: { P: Px }) {
  return (
    <span
      aria-hidden="true"
      data-testid="wall-caret"
      style={{
        display: 'inline-block', width: P(4), height: '1.1em', background: 'var(--wt-accent)', marginLeft: P(3),
        verticalAlign: 'middle', borderRadius: P(2), animation: 'wall-caret 1s steps(1) infinite',
      }}
    />
  );
}

/**
 * Sets `box`'s type to the largest of `sizes` (real pixels, largest first)
 * at which `inner` is no taller than the room inside `box`; the last one
 * when none fits. For words in a box of fixed height. Runs before paint, so
 * a letter that tips the words onto one more line never shows too big
 * first. `dep` is whatever changes the words.
 */
export function useLargestFit(box: RefObject<HTMLElement | null>, inner: RefObject<HTMLElement | null>, sizes: readonly number[] | null, dep: unknown): void {
  const key = sizes?.join(',');
  useLayoutEffect(() => {
    const el = box.current;
    const words = inner.current;
    if (!el || !words || !key) return;
    const style = getComputedStyle(el);
    const room = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    for (const size of key.split(',')) {
      el.style.fontSize = `${size}px`;
      if (words.offsetHeight <= room) break;
    }
  }, [box, inner, key, dep]);
}

interface WallTextFieldProps {
  P: Px;
  /** The words so far (`useWallTyping().text`). */
  text: string;
  /** Shown faint after the caret while nothing is typed. */
  placeholder: string;
  /** The keyboard is up: an accent border and the caret. */
  typing?: boolean;
  /** Characters left before the cap (`useWallTyping().left`); shown when not null. */
  left?: number | null;
  /** Type size in authored pixels. */
  fontSize?: number;
  /** The field's least height in authored pixels; long words wrap onto more lines rather than scroll out of sight. */
  minHeight?: number;
  /**
   * A field that never grows under a finger: a fixed height in authored pixels, or `fill` to take the room its
   * column has left. The words start at the top and step down through `fontSizes` as they fill it.
   */
  height?: number | 'fill';
  /** With `height`: the type sizes to try, largest first, in authored pixels. The last one is used when none fits. */
  fontSizes?: readonly number[];
  testId?: string;
  /** Something drawn after the words, inside the field (a clear button). */
  trailing?: ReactNode;
}

/**
 * Words typed on the wall's keyboard, drawn in a field: the words, the caret
 * while typing, a faint placeholder while empty, and how many characters are
 * left once the cap is near. Long words wrap, so the caret never runs out of
 * sight. Colours from the `--wt-*` variables (`wallTypingVars`).
 */
export function WallTextField({
  P, text, placeholder, typing = true, left = null, fontSize = 46, minHeight = 104, height, fontSizes, testId = 'wall-text-field', trailing,
}: WallTextFieldProps) {
  const t = useTranslate('modules');
  const box = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLSpanElement>(null);
  const fixed = height !== undefined;
  const sizes = fixed ? fontSizes ?? [fontSize] : null;
  useLargestFit(box, words, sizes && sizes.map(P), `${text}|${left}`);
  return (
    <div
      ref={box}
      data-testid={testId}
      style={{
        display: 'flex', alignItems: fixed ? 'flex-start' : 'center', gap: P(16), boxSizing: 'border-box',
        ...(height === 'fill' ? { flex: 1, minHeight: 0, overflow: 'hidden' } : fixed ? { height: P(height), overflow: 'hidden' } : { minHeight: P(minHeight) }),
        padding: `${P(14)}px ${P(28)}px`, borderRadius: P(22), background: 'var(--wt-bg)',
        border: typing ? `${P(3)}px solid var(--wt-accent)` : `${P(2)}px solid var(--wt-border)`,
        boxShadow: typing ? `0 0 0 ${P(8)}px color-mix(in srgb, var(--wt-accent) 16%, transparent)` : undefined,
        fontSize: P(sizes ? sizes[0] : fontSize), fontWeight: 600, lineHeight: 1.2, color: 'var(--wt-text)',
      }}
    >
      <span ref={words} data-testid={`${testId}-words`} style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {text}
        {typing && <WallCaret P={P} />}
        {!text && <span style={{ color: 'var(--wt-text-3)', fontWeight: 500, marginLeft: typing ? P(12) : 0 }}>{placeholder}</span>}
      </span>
      {left !== null && (
        <span data-testid={`${testId}-left`} style={{ flexShrink: 0, alignSelf: fixed ? 'flex-end' : undefined, fontSize: P(22), fontWeight: 600, color: 'var(--wt-text-3)', fontVariantNumeric: 'tabular-nums' }}>
          {t('wallKeyboard.left', { count: left })}
        </span>
      )}
      {trailing}
    </div>
  );
}

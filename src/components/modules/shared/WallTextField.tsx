'use client';

import type { ReactNode } from 'react';
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
export function WallTextField({ P, text, placeholder, typing = true, left = null, fontSize = 46, minHeight = 104, testId = 'wall-text-field', trailing }: WallTextFieldProps) {
  const t = useTranslate('modules');
  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex', alignItems: 'center', gap: P(16), minHeight: P(minHeight), boxSizing: 'border-box',
        padding: `${P(14)}px ${P(28)}px`, borderRadius: P(22), background: 'var(--wt-bg)',
        border: typing ? `${P(3)}px solid var(--wt-accent)` : `${P(2)}px solid var(--wt-border)`,
        boxShadow: typing ? `0 0 0 ${P(8)}px color-mix(in srgb, var(--wt-accent) 16%, transparent)` : undefined,
        fontSize: P(fontSize), fontWeight: 600, lineHeight: 1.2, color: 'var(--wt-text)',
      }}
    >
      <span data-testid={`${testId}-words`} style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {text}
        {typing && <WallCaret P={P} />}
        {!text && <span style={{ color: 'var(--wt-text-3)', fontWeight: 500, marginLeft: typing ? P(12) : 0 }}>{placeholder}</span>}
      </span>
      {left !== null && (
        <span data-testid={`${testId}-left`} style={{ flexShrink: 0, fontSize: P(22), fontWeight: 600, color: 'var(--wt-text-3)', fontVariantNumeric: 'tabular-nums' }}>
          {t('wallKeyboard.left', { count: left })}
        </span>
      )}
      {trailing}
    </div>
  );
}

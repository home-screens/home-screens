'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Check } from 'lucide-react';

/** How far a ticked row fades, on every list the phone ticks things off. */
export const TICK_DONE_OPACITY = 0.55;

/** The card a tick row sits on: a grocery line, or a to-do row with its grip and pencil. */
export const TICK_ROW_FRAME: CSSProperties = {
  borderRadius: 12,
  border: '1px solid var(--hs-border)',
  background: 'var(--hs-bg-panel)',
  marginBottom: 6,
};

/** The square that holds the tick: 24 px, green and ticked when done, dashed while the tick is on its way. */
export function TickBox({ checked, pending = false }: { checked: boolean; pending?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        boxSizing: 'border-box',
        border: checked ? '2px solid var(--hs-success)' : `2px ${pending ? 'dashed' : 'solid'} var(--hs-text-faint)`,
        background: checked ? 'var(--hs-success)' : 'transparent',
        color: 'var(--hs-on-success)',
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pending ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
    >
      {checked && <Check size={16} strokeWidth={3} />}
    </span>
  );
}

/**
 * One thing to tick off a list, announced as a checkbox: a family to-do item,
 * a grocery line from the meal plan, an item on the Mealie shopping list. The
 * same item looks and reads the same on Lists and on Meals.
 *
 * `label` is the first line; `detail` a quieter line under it; `trailing`
 * sits at the end (an amount, a due chip, initials). A screen reader hears
 * all of it unless `ariaLabel` names the row on its own (a to-do item keeps
 * its name once it gains a due chip). `pending` says the tick has not
 * reached the hub yet. `framed` off leaves the card, and the fade, to a row
 * that holds more than the tick (the to-do row with its grip and pencil).
 */
export default function TickRow({
  label,
  ariaLabel,
  checked,
  onToggle,
  detail,
  trailing,
  pending = false,
  framed = true,
  testId,
  style,
}: {
  label: string;
  ariaLabel?: string;
  checked: boolean;
  onToggle: () => void;
  detail?: string;
  trailing?: ReactNode;
  pending?: boolean;
  framed?: boolean;
  testId?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-busy={pending || undefined}
      aria-label={ariaLabel}
      onClick={onToggle}
      data-testid={testId}
      data-checked={checked ? 'true' : 'false'}
      className="press-scale"
      style={{
        width: '100%',
        minWidth: 0,
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        textAlign: 'left',
        color: 'inherit',
        cursor: 'pointer',
        fontFamily: 'inherit',
        WebkitTapHighlightColor: 'transparent',
        ...(framed
          ? { ...TICK_ROW_FRAME, padding: '10px 12px', opacity: checked ? TICK_DONE_OPACITY : 1, transition: 'opacity 0.15s' }
          : { flex: 1, padding: '4px 4px 4px 0', border: 'none', background: 'none' }),
        ...style,
      }}
    >
      <TickBox checked={checked} pending={pending} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 15,
            fontWeight: 500,
            lineHeight: 1.25,
            color: checked ? 'var(--hs-text-faint)' : 'var(--hs-text-body)',
            textDecoration: checked ? 'line-through' : 'none',
            overflowWrap: 'anywhere',
          }}
        >
          {label}
        </span>
        {detail && (
          <span style={{ display: 'block', fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {detail}
          </span>
        )}
      </span>
      {trailing}
    </button>
  );
}

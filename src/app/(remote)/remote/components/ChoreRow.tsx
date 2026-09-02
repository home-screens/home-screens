'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Check, Lock } from 'lucide-react';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useHoldConfirm } from '@/hooks/useHoldConfirm';
import { useTranslate } from '@/i18n';

/** Minimal shape the row renders from — the parent's assignment carries more fields. */
export interface ChoreRowAssignment {
  choreId: string;
  choreName: string;
  choreEmoji: string;
  points: number;
  isCompleted: boolean;
}

interface ChoreRowProps {
  assignment: ChoreRowAssignment;
  /** Optimistic in-flight toggle for this row — dims and disables it. */
  isToggling: boolean;
  /** True for kids viewing a past day: locked chip, non-interactive, not a button. */
  readOnly: boolean;
  /**
   * Kid view: un-checking a finished chore takes a press-and-hold instead of a
   * tap. A tap is how a sibling "accidentally" undoes someone else's work; a
   * hold is deliberate. Checking a chore off stays a single tap.
   */
  holdToUncheck?: boolean;
  /** Fill color for the completed checkbox (selected member's color, else accent). */
  checkedColor: string;
  showPoints: boolean;
  onToggle: () => void;
}

/** How long the hold takes. Long enough to be deliberate, short enough not to feel stuck. */
export const UNCHECK_HOLD_MS = 700;
const HINT_MS = 1800;

/**
 * A single chore card in the Today list. The read-only branch (kids viewing a
 * past day) renders a non-interactive div with a locked chip rather than a
 * button, so it is not announced as clickable.
 */
export default function ChoreRow({
  assignment,
  isToggling,
  readOnly,
  holdToUncheck = false,
  checkedColor,
  showPoints,
  onToggle,
}: ChoreRowProps) {
  const t = useTranslate('remote');
  const done = assignment.isCompleted;
  const holdMode = holdToUncheck && done && !readOnly;

  // ── Press-and-hold to un-check ──
  // `firedRef` tells pointerup whether the hold ran to completion (toggle
  // already happened) or was released early (show the hint). The trailing
  // click event that follows a completed hold has to be swallowed too:
  // by then the row has re-rendered as "not done", and a click there would
  // check the chore straight back off.
  const firedRef = useRef(false);
  const swallowClickRef = useRef(false);
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  const hold = useHoldConfirm({
    durationMs: UNCHECK_HOLD_MS,
    onConfirm: () => {
      firedRef.current = true;
      swallowClickRef.current = true;
      setHint(false);
      onToggle();
    },
  });

  const showHint = () => {
    setHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), HINT_MS);
  };

  const handlePointerDown = () => {
    // A new gesture: whatever the last one left behind no longer applies.
    swallowClickRef.current = false;
    if (!holdMode || isToggling) return;
    firedRef.current = false;
    hold.onPointerDown();
  };
  const handlePointerUp = () => {
    if (!holdMode) return;
    hold.onPointerUp();
    if (!firedRef.current) showHint();
  };
  const handlePointerCancel = () => {
    if (!holdMode) return;
    hold.onPointerCancel();
  };
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (swallowClickRef.current) {
      swallowClickRef.current = false;
      return;
    }
    // Keyboard activation (Enter/Space) arrives as a click with detail 0; a
    // keyboard user cannot hold, so it toggles directly.
    if (holdMode && e.detail !== 0) return;
    onToggle();
  };

  const rowStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    background: done ? 'var(--hs-bg-card)' : 'var(--hs-bg-hover)',
    borderRadius: 12,
    marginBottom: 6,
    cursor: readOnly ? ('default' as const) : ('pointer' as const),
    transition: 'all 0.15s',
    border: 'none',
    color: 'inherit',
    textAlign: 'left' as const,
    opacity: isToggling ? 0.6 : 1,
    // A long press must not open the browser's copy/share sheet.
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    WebkitTouchCallout: 'none' as const,
    touchAction: 'pan-y' as const,
  };

  const checkbox = readOnly ? (
    // Locked chip: kid-viewing-past — visually distinct, not interactive
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: done ? 'var(--hs-bg-hover)' : 'var(--hs-bg-card)',
        border: done ? 'none' : '1px dashed var(--hs-border-strong)',
        color: 'var(--hs-text-faint)',
      }}
      aria-hidden="true"
    >
      {done ? (
        <Check size={16} color="var(--hs-text-muted)" strokeWidth={2.5} />
      ) : (
        <Lock size={12} color="var(--hs-text-faint)" strokeWidth={2.25} />
      )}
    </div>
  ) : (
    <div
      style={{
        position: 'relative',
        width: 28,
        height: 28,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.15s',
        background: done ? checkedColor : 'transparent',
        border: done ? 'none' : '2px solid var(--hs-border-strong)',
        overflow: 'hidden',
      }}
    >
      {/* Hold progress: the fill drains from the checkbox as the hold runs. */}
      {holdMode && hold.isHolding && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--hs-bg-card)',
            transformOrigin: 'bottom',
            transform: `scaleY(${hold.progress})`,
            opacity: 0.85,
          }}
        />
      )}
      {done && <Check size={16} color="white" strokeWidth={2.5} style={{ position: 'relative' }} />}
    </div>
  );

  const rowInner = (
    <>
      {checkbox}

      {assignment.choreEmoji && (
        <span style={{ flexShrink: 0 }}>
          <ChoreIcon value={assignment.choreEmoji} size={20} color={done ? 'var(--hs-text-faint)' : 'var(--hs-text-muted)'} />
        </span>
      )}

      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontSize: 15,
            fontWeight: 500,
            textDecoration: done ? 'line-through' : 'none',
            color: done ? 'var(--hs-text-faint)' : 'var(--hs-text-body)',
          }}
        >
          {assignment.choreName}
        </span>
        {hint && (
          <span role="status" style={{ fontSize: 12, color: checkedColor, fontWeight: 500 }}>
            {t('choresTab.holdToUncheckHint')}
          </span>
        )}
      </span>

      {showPoints && assignment.points > 0 && (
        <span
          style={{
            fontSize: 11,
            flexShrink: 0,
            padding: '2px 8px',
            borderRadius: 999,
            background: 'var(--hs-bg-hover)',
            color: 'var(--hs-text-faint)',
            opacity: done ? 0.3 : 1,
          }}
        >
          {assignment.points === 1
            ? t('choresTab.ticketCountSingular', { n: assignment.points })
            : t('choresTab.ticketCountPlural', { n: assignment.points })}
        </span>
      )}
    </>
  );

  if (readOnly) {
    // Non-interactive row: not a button, no press-scale, not announced as clickable.
    return <div style={rowStyle}>{rowInner}</div>;
  }

  return (
    <button
      className="press-scale"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      onContextMenu={holdMode ? (e) => e.preventDefault() : undefined}
      disabled={isToggling}
      aria-label={
        done
          ? t('choresTab.choreAriaLabelCompleted', { chore: assignment.choreName })
          : t('choresTab.choreAriaLabelMarkComplete', { chore: assignment.choreName })
      }
      style={rowStyle}
    >
      {rowInner}
    </button>
  );
}

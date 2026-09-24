'use client';

import { Check, Lock, MoreHorizontal } from 'lucide-react';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useHoldToUncheck } from '@/hooks/useHoldToUncheck';
import { useLongPress } from '@/hooks/useLongPress';
import { useMovedTapGuard } from '@/hooks/useMovedTapGuard';
import { useTranslate } from '@/i18n';

/** Minimal shape the row renders from — the parent's assignment carries more fields. */
export interface ChoreRowAssignment {
  choreId: string;
  choreName: string;
  choreEmoji: string;
  points: number;
  isCompleted: boolean;
  /** A grown-up marked it "not today" for this person. */
  isSkipped?: boolean;
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
  /** Grown-ups only: a hold (or right-click) opens the chore's menu. */
  onLongPress?: () => void;
  /** Grown-ups only: a visible "..." that opens the same menu, so it can be found without knowing to hold. */
  onMenu?: () => void;
  /** The person and day on screen: picking another redraws the list without it counting as the row moving. */
  view: string;
}

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
  onLongPress,
  onMenu,
  view,
}: ChoreRowProps) {
  const t = useTranslate('remote');
  const done = assignment.isCompleted;
  const skipped = !!assignment.isSkipped && !done;
  const holdMode = holdToUncheck && done && !readOnly && !isToggling;

  // The gesture itself lives in the hook, shared with the wall chart so the
  // two surfaces cannot drift apart on what a tap and a hold each mean.
  const hold = useHoldToUncheck();
  const longPress = useLongPress();
  // A "not today" is a grown-up's mark: a kid's tap does nothing to it, and a
  // grown-up's tap takes it away again.
  // A tap right after the row slid on screen was meant for what was there before.
  const { ref: rowRef, guard } = useMovedTapGuard<HTMLElement>(view);
  const tapHandlers = skipped && !onLongPress ? {} : hold.rowHandlers(assignment.choreId, holdMode, guard(onToggle)!);
  const handlers = longPress(guard(onLongPress), tapHandlers);
  const holding = hold.holdingKey === assignment.choreId;
  const hint = hold.hintKey === assignment.choreId;

  const rowStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    background: done || skipped ? 'var(--hs-bg-card)' : 'var(--hs-bg-hover)',
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

  const checkbox = skipped ? (
    <div
      aria-hidden="true"
      style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px dashed var(--hs-border-strong)', color: 'var(--hs-text-faint)', fontWeight: 700,
      }}
    >
      –
    </div>
  ) : readOnly ? (
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
      {holding && (
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

      {/* The hold hint takes the name's place rather than adding a line: a row
          that grows and shrinks moves the rows under it, and a second tap
          then lands on the wrong chore. */}
      <span style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontSize: 15,
            fontWeight: 500,
            textDecoration: done ? 'line-through' : 'none',
            color: done || skipped ? 'var(--hs-text-faint)' : 'var(--hs-text-body)',
            visibility: hint ? 'hidden' : 'visible',
          }}
        >
          {assignment.choreName}
        </span>
        {hint && (
          <span
            role="status"
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              fontSize: 13, color: checkedColor, fontWeight: 600, lineHeight: 1.25,
            }}
          >
            {t('choresTab.holdToUncheckHint')}
          </span>
        )}
      </span>

      {skipped && (
        <span style={{ fontSize: 11, flexShrink: 0, padding: '2px 8px', borderRadius: 999, border: '1px dashed var(--hs-border-strong)', color: 'var(--hs-text-faint)' }}>
          {t('choresTab.notToday.chip')}
        </span>
      )}

      {!skipped && showPoints && assignment.points > 0 && (
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

  if (readOnly || (skipped && !onLongPress)) {
    // Non-interactive row: not a button, no press-scale, not announced as clickable.
    return <div ref={rowRef as React.RefObject<HTMLDivElement>} style={rowStyle}>{rowInner}</div>;
  }

  const rowButton = (
    <button
      ref={onMenu ? undefined : (rowRef as React.RefObject<HTMLButtonElement>)}
      className="press-scale"
      {...handlers}
      disabled={isToggling}
      aria-label={
        skipped
          ? t('choresTab.notToday.ariaLabel', { chore: assignment.choreName })
          : done
            ? t('choresTab.choreAriaLabelCompleted', { chore: assignment.choreName })
            : t('choresTab.choreAriaLabelMarkComplete', { chore: assignment.choreName })
      }
      style={onMenu ? { ...rowStyle, marginBottom: 0, flex: 1, minWidth: 0 } : rowStyle}
    >
      {rowInner}
    </button>
  );
  if (!onMenu) return rowButton;

  return (
    <div ref={rowRef as React.RefObject<HTMLDivElement>} style={{ display: 'flex', alignItems: 'stretch', gap: 4, marginBottom: 6 }}>
      {rowButton}
      <button
        type="button"
        data-testid={`chore-menu-${assignment.choreId}`}
        onClick={guard(onMenu)}
        aria-label={t('choresTab.dayMenu.open', { chore: assignment.choreName })}
        style={{
          flexShrink: 0, width: 40, border: 'none', borderRadius: 12, background: 'var(--hs-bg-card)',
          color: 'var(--hs-text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <MoreHorizontal size={20} aria-hidden />
      </button>
    </div>
  );
}

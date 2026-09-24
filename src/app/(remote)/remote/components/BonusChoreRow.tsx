'use client';

import { useRef } from 'react';
import { Check, Hand, Lock, MoreHorizontal, RotateCcw } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import type { BonusItem } from '@/lib/chore-bonus';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useHoldToUncheck } from '@/hooks/useHoldToUncheck';
import { useLongPress } from '@/hooks/useLongPress';
import { useMovedTapGuard } from '@/hooks/useMovedTapGuard';
import { useTranslate } from '@/i18n';

const AMBER = '#f59e0b';
/** How long after Let it go a tap on the same row does not tick it. */
const LET_GO_TICK_GUARD_MS = 5000;

/**
 * One bonus chore in the phone's Today list, as the person picked at the top
 * sees it:
 * - open (up for grabs): tick it if already done, or Grab it to keep it for yourself
 * - grabbed by you: your colour, tick it when done, or let it go (under the
 *   name: Grab it's place holds a "Yours" label, so a second tap there does nothing)
 * - grabbed or done by someone else, or done by you on another day: locked, and says who and when
 * - everyone can: a plain tick, once per time round
 * A kid looking at a past day sees every row locked: nothing there is theirs to change.
 * On an earlier day of today's time round, your grab is locked: it is
 * finished or let go from today's page.
 * A tap on the row right after it moved on screen is ignored (`useMovedTapGuard`).
 */
export default function BonusChoreRow({
  item,
  memberId,
  members,
  date,
  today,
  formatDay,
  canEdit,
  canGrab,
  atLimit,
  grabLimit,
  isBusy,
  holdToUncheck,
  checkedColor,
  notice,
  onTick,
  onGrab,
  onLimitTap,
  onLetGo,
  onLongPress,
  onMenu,
  onPutBack,
}: {
  item: BonusItem;
  /** The person picked at the top of the list. */
  memberId: string;
  members: FamilyMember[];
  /** The day on screen, as `YYYY-MM-DD`. */
  date: string;
  /** The hub's today, as `YYYY-MM-DD`: a job done today says "today", not the weekday. */
  today: string;
  /** A day as the row names it ("Tuesday"). */
  formatDay: (date: string) => string;
  /** False for a kid looking at a past day. */
  canEdit: boolean;
  /** Grabs are for today only. */
  canGrab: boolean;
  /** The person already holds as many grabs as the household allows. */
  atLimit: boolean;
  /** The household's grab limit, for the wording at the limit. */
  grabLimit: number;
  isBusy: boolean;
  holdToUncheck: boolean;
  checkedColor: string;
  /** A short message about this row ("Cleo is already on that one"), shown under it. */
  notice?: string | null;
  onTick: () => void;
  onGrab: () => void;
  /** A tap on Grab it at the grab limit: says, under the row, what to do instead. */
  onLimitTap: () => void;
  onLetGo: () => void;
  onLongPress?: () => void;
  /** Grown-ups only: opens the same menu a hold does. */
  onMenu?: () => void;
  /** Grown-ups only, on a done "when I put it back" chore: opens it up again. */
  onPutBack?: () => void;
}) {
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  const hold = useHoldToUncheck();
  const longPress = useLongPress();
  const { chore } = item;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? tModules('chore-chart.unknownAssignee');
  const colorOf = (id: string) => members.find((m) => m.id === id)?.color ?? 'var(--hs-text-faint)';

  const grab = item.grab;
  const myDoneOn = grab ? (grab.status === 'done' && grab.memberId === memberId ? grab.date : undefined) : item.doneOn[memberId];
  const mineDone = myDoneOn === date;
  // Done by this person on another day this time round (a weekly or put-back
  // one): theirs, but not undone from here, and it says when.
  const doneOtherDay = myDoneOn !== undefined && myDoneOn !== date;
  const mineHeld = grab?.status === 'grabbed' && grab.memberId === memberId;
  const othersId = grab && grab.status !== 'open' && grab.memberId !== memberId ? grab.memberId : null;
  const pastLocked = !canEdit;
  // Your grab seen from an earlier day of today's round: finished or let go
  // from today's page. What you did on the day on screen stays yours to undo.
  const roundLocked = item.roundIsToday && mineHeld;
  const locked = !!othersId || doneOtherDay || pastLocked || roundLocked;
  const didOn = (day: string, name?: string) => day === today
    ? (name ? t('choresTab.bonus.didItToday', { name }) : t('choresTab.bonus.youDidItToday'))
    : (name ? t('choresTab.bonus.didItOn', { name, day: formatDay(day) }) : t('choresTab.bonus.youDidItOn', { day: formatDay(day) }));
  const tickets = chore.points === 1
    ? t('choresTab.ticketCountSingular', { n: chore.points })
    : t('choresTab.ticketCountPlural', { n: chore.points });

  const showGrabButton = !!grab && grab.status === 'open' && canGrab && canEdit;
  const showLetGo = mineHeld && canEdit && !item.roundIsToday;
  const holdMode = holdToUncheck && mineDone && canEdit && !isBusy;
  // A tap on this row right after it slid on screen is meant for whatever was
  // there before: every action here waits until it has stayed put.
  const { ref: rowRef, guard } = useMovedTapGuard<HTMLDivElement>(`${memberId}:${date}`);
  // Just let go: a tap on the same row soon after is the "did it work?" tap
  // on Let it go, not a tick. (The garage let go and ticked for 20 tickets.)
  const letGoAt = useRef(0);
  const letGo = () => { letGoAt.current = Date.now(); onLetGo(); };
  const tick = () => { if (Date.now() - letGoAt.current >= LET_GO_TICK_GUARD_MS) onTick(); };
  const handlers = longPress(guard(onLongPress), locked ? {} : hold.rowHandlers(chore.id, holdMode, guard(tick)!));
  const holding = hold.holdingKey === chore.id;
  const hinting = hold.hintKey === chore.id;



  let line: string | null = null;
  let lineColor = 'var(--hs-text-faint)';
  if (hinting) {
    line = t('choresTab.holdToUncheckHint');
    lineColor = checkedColor;
  } else if (othersId) {
    const doneDate = grab?.status === 'done' ? grab.date : undefined;
    line = grab?.status === 'grabbed'
      ? t('choresTab.bonus.onIt', { name: nameOf(othersId) })
      : doneDate && doneDate !== date
        ? didOn(doneDate, nameOf(othersId))
        : t('choresTab.bonus.didIt', { name: nameOf(othersId) });
  } else if (doneOtherDay && myDoneOn) {
    line = didOn(myDoneOn);
  } else if (mineDone) {
    line = t('choresTab.bonus.youGotIt', { n: chore.points });
    lineColor = AMBER;
  } else if (mineHeld) {
    // "Tick it when you're done" only where it can be ticked.
    line = locked ? t('choresTab.bonus.youreOnIt') : t('choresTab.bonus.youGrabbedIt');
    lineColor = checkedColor;
  } else if (!grab) {
    line = tModules('chore-chart.bonus.everyoneCan');
  } else if (showGrabButton) {
    // The same line at the limit: a row that changes size moves the rows
    // under it, and a second tap then lands on the wrong chore.
    line = tickets;
    lineColor = AMBER;
  }

  const background = locked
    ? 'var(--hs-bg-card)'
    : mineHeld
      ? `color-mix(in srgb, ${checkedColor} 10%, var(--hs-bg-card))`
      : 'color-mix(in srgb, #f59e0b 8%, var(--hs-bg-card))';
  const border = locked
    ? '1px solid var(--hs-border)'
    : mineHeld
      ? `1.5px solid ${checkedColor}`
      : mineDone
        ? '1px solid transparent'
        : '1px dashed color-mix(in srgb, #f59e0b 55%, transparent)';

  const checkbox = locked ? (
    <div aria-hidden style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--hs-bg-hover)' }}>
      {mineDone || doneOtherDay || grab?.status === 'done' ? <Check size={16} color="var(--hs-text-muted)" strokeWidth={2.5} /> : <Lock size={12} color="var(--hs-text-faint)" />}
    </div>
  ) : (
    <div
      aria-hidden
      style={{
        position: 'relative', width: 28, height: 28, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: mineDone ? checkedColor : 'transparent',
        border: mineDone ? 'none' : `2px ${mineHeld ? 'solid' : 'dashed'} ${mineHeld ? checkedColor : AMBER}`,
      }}
    >
      {holding && (
        <div style={{ position: 'absolute', inset: 0, background: 'var(--hs-bg-card)', transformOrigin: 'bottom', transform: `scaleY(${hold.progress})`, opacity: 0.85 }} />
      )}
      {mineDone && <Check size={16} color="white" strokeWidth={2.5} style={{ position: 'relative' }} />}
    </div>
  );

  const sideButton = {
    flexShrink: 0, minHeight: 44, padding: '0 14px', borderRadius: 999,
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' as const, cursor: 'pointer',
  };

  return (
    <div ref={rowRef} style={{ marginBottom: 6 }}>
      <div
        data-testid={`bonus-row-${chore.id}`}
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderRadius: 12, background, border,
          padding: '0 10px 0 0', opacity: isBusy ? 0.6 : 1,
        }}
      >
        <button
          type="button"
          className={locked ? undefined : 'press-scale'}
          disabled={isBusy || (locked && !onLongPress)}
          {...handlers}
          aria-label={
            locked
              ? (line ?? chore.name)
              : mineDone
                ? t('choresTab.choreAriaLabelCompleted', { chore: chore.name })
                : t('choresTab.choreAriaLabelMarkComplete', { chore: chore.name })
          }
          style={{
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0 12px 14px', minHeight: 56,
            background: 'transparent', border: 'none', color: 'inherit', textAlign: 'left', cursor: locked ? 'default' : 'pointer',
            userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'pan-y',
          }}
        >
          {checkbox}
          {chore.emoji && (
            <span style={{ flexShrink: 0, opacity: locked ? 0.5 : 1 }}>
              <ChoreIcon value={chore.emoji} size={20} color={mineDone || locked ? 'var(--hs-text-faint)' : 'var(--hs-text-muted)'} />
            </span>
          )}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{
              fontSize: 15, fontWeight: 500,
              textDecoration: mineDone || doneOtherDay || grab?.status === 'done' ? 'line-through' : 'none',
              color: mineDone || locked ? 'var(--hs-text-faint)' : 'var(--hs-text-body)',
              overflowWrap: 'anywhere',
            }}>
              {chore.name}
            </span>
            {line && (
              <span role={hinting ? 'status' : undefined} style={{ fontSize: 12, fontWeight: mineHeld || mineDone ? 600 : 400, color: lineColor, display: 'flex', alignItems: 'center', gap: 6 }}>
                {othersId && !hinting && (
                  <span aria-hidden style={{ width: 16, height: 16, borderRadius: '50%', background: colorOf(othersId), color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {nameOf(othersId)[0]}
                  </span>
                )}
                {line}
              </span>
            )}
          </span>
          {!locked && !mineHeld && !mineDone && !showGrabButton && (
            <span style={{ fontSize: 11, flexShrink: 0, padding: '2px 8px', borderRadius: 999, fontWeight: 700, color: AMBER, background: 'color-mix(in srgb, #f59e0b 18%, transparent)' }}>
              {tickets}
            </span>
          )}
        </button>

        {/* At the limit Grab it stays where it is, greyed, and a tap says why
            under the row: nothing in the list changes size. */}
        {showGrabButton && (
          <button
            type="button"
            className="press-scale"
            data-testid={`grab-${chore.id}`}
            data-at-limit={atLimit || undefined}
            disabled={isBusy}
            onClick={guard(atLimit ? onLimitTap : onGrab)}
            aria-label={atLimit
              ? t(grabLimit > 1 ? 'choresTab.bonus.limitLineMany' : 'choresTab.bonus.limitLine')
              : t('choresTab.bonus.grabAriaLabel', { chore: chore.name, tickets })}
            style={{
              ...sideButton, border: 'none',
              background: atLimit ? 'var(--hs-bg-hover)' : AMBER, color: atLimit ? 'var(--hs-text-faint)' : '#111',
            }}
          >
            <Hand size={15} aria-hidden />
            {t('choresTab.bonus.grab')}
          </button>
        )}
        {showLetGo && (
          <span
            data-testid={`yours-${chore.id}`}
            style={{ ...sideButton, cursor: 'default', border: 'none', background: `color-mix(in srgb, ${checkedColor} 16%, transparent)`, color: checkedColor }}
          >
            <Hand size={15} aria-hidden />
            {t('choresTab.bonus.yours')}
          </span>
        )}
        {onMenu && (
          <button
            type="button"
            data-testid={`chore-menu-${chore.id}`}
            onClick={guard(onMenu)}
            aria-label={t('choresTab.dayMenu.open', { chore: chore.name })}
            style={{ flexShrink: 0, width: 40, height: 56, border: 'none', background: 'none', color: 'var(--hs-text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <MoreHorizontal size={20} aria-hidden />
          </button>
        )}
        {(showLetGo || onPutBack) && (
          // Under the name, not where Grab it was: a second tap on Grab it
          // lands on the Yours label, never on Let it go. Put it back sits here
          // too, so a long name keeps the width of the row.
          <div style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 0 10px 54px', marginTop: -4 }}>
            {showLetGo && (
              <button
                type="button"
                className="press-scale"
                data-testid={`let-go-${chore.id}`}
                disabled={isBusy}
                onClick={guard(letGo)}
                style={{ ...sideButton, border: `1.5px solid ${checkedColor}`, background: 'transparent', color: checkedColor }}
              >
                {t('choresTab.bonus.letGo')}
              </button>
            )}
            {onPutBack && (
              <button
                type="button"
                className="press-scale"
                data-testid={`put-back-${chore.id}`}
                disabled={isBusy}
                onClick={guard(onPutBack)}
                style={{ ...sideButton, border: '1px solid var(--hs-border-strong)', background: 'var(--hs-bg-hover)', color: 'var(--hs-text-body)', fontWeight: 600 }}
              >
                <RotateCcw size={14} aria-hidden />
                {t('choresTab.dayMenu.putBack')}
              </button>
            )}
          </div>
        )}
      </div>
      {notice && (
        <p role="status" data-testid={`bonus-notice-${chore.id}`} style={{ margin: '4px 4px 0', fontSize: 12.5, color: 'var(--hs-text-muted)' }}>
          {notice}
        </p>
      )}
    </div>
  );
}

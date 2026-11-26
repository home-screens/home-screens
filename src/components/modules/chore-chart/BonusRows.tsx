'use client';

import { useMemo } from 'react';
import type { FamilyMember } from '@/types/family';
import type { ChoreChartConfig } from '@/types/config';
import { bonusDisplayOrder, bonusDoneDay, type BonusItem } from '@/lib/chore-bonus';
import { TEXT_OPACITY, DIVIDER, ink } from '@/lib/constants';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { useHoldToUncheck } from '@/hooks/useHoldToUncheck';
import { getUniqueInitials, memberInitials } from '@/lib/family-avatar';
import ChoreIcon from './ChoreIcon';
import MemberDot from '../shared/MemberDot';
import { usePressedKey } from '../shared/usePressedKey';
import { CHORE_ROW_ATTR } from './FitRows';
import { TicketValue, showsTicketValue } from './ChoreRowExtras';
import { choreDotGap, choreDotSize, choreIconSize } from './layout';

interface BonusRowsProps {
  config: ChoreChartConfig;
  /** Today's bonus chores, as `useChoreData` resolves them. */
  items: BonusItem[];
  members: FamilyMember[];
  /** The hub's calendar day. */
  today: string;
  /** Fitted module font size: the dots scale with it. */
  fontSize: number;
  toggleComplete: (choreId: string, memberId: string) => Promise<unknown>;
  /**
   * `section` is the Today view's own: a heading and a tinted block, spaced by
   * the list around it. `strip` stands under the board's columns and `plain`
   * under the compact grid, both with margins in em so their fits can budget
   * them (`BONUS_HEAD_EM`).
   */
  variant: 'section' | 'strip' | 'plain';
}

/**
 * Today's bonus chores on a card: read-only for up-for-grabs (grabbing needs
 * the picker the wall and the phone have), one dot per person for everyone-can.
 * Bonus chores are in nobody's column and nobody's count, so each view that
 * lists the day's chores draws them here, after the regular ones.
 */
export function BonusRows({ config, items, members, today, fontSize, toggleComplete, variant }: BonusRowsProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const allowTouch = config.allowDisplayComplete;
  const accentColor = config.accentColor ?? '#f59e0b';
  const [pressedKey, press] = usePressedKey();
  // Ticking is one tap; un-ticking takes a press and hold, as on every card row.
  const hold = useHoldToUncheck();
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const initials = useMemo(() => getUniqueInitials(members), [members]);
  // Grabbed first, finished last: the order the wall's band uses.
  const ordered = bonusDisplayOrder(items);
  if (ordered.length === 0) return null;

  const plain = variant === 'plain';
  const dotSize = choreDotSize(fontSize, !!allowTouch);
  const gap = choreDotGap(dotSize, !!allowTouch);
  const initialOf = (member: FamilyMember) => initials.get(member.id) ?? memberInitials(member.name);
  const didItOn = (name: string, date: string) => {
    const { form, day } = bonusDoneDay(date, today, locale);
    return t(form === 'weekday' ? 'chore-chart.bonus.didItOn' : 'chore-chart.bonus.didItOnDate', { name, day });
  };

  /** One person's dot on an everyone-can chore. */
  function renderDot(item: BonusItem, memberId: string) {
    const member = memberMap.get(memberId);
    if (!member) return null;
    const { chore } = item;
    const key = `${chore.id}:${memberId}`;
    const doneOn = item.doneOn[memberId];
    // Done on another day this week: theirs, drawn fainter and not undone from here.
    if (doneOn !== undefined && doneOn !== today) {
      const label = didItOn(member.name, doneOn);
      return (
        <MemberDot key={key} role="img" aria-label={label} title={label} size={dotSize} color={member.color} initial={initialOf(member)} isCompleted style={{ opacity: 0.72 }} />
      );
    }
    const isCompleted = item.doneIds.includes(memberId);
    // A finished dot is the one a passing tap must not undo.
    const handlers = allowTouch
      ? hold.rowHandlers(key, isCompleted, () => { void press(key, () => toggleComplete(chore.id, memberId)); })
      : undefined;
    return (
      <MemberDot
        key={key}
        {...handlers}
        data-testid="chore-assignee-dot"
        role={allowTouch ? 'button' : undefined}
        tabIndex={allowTouch ? 0 : undefined}
        aria-pressed={allowTouch ? isCompleted : undefined}
        aria-label={allowTouch
          ? t(isCompleted ? 'chore-chart.ariaLabels.undoChore' : 'chore-chart.ariaLabels.completeChore', { chore: chore.name, member: member.name })
          : undefined}
        title={member.name}
        size={dotSize}
        color={member.color}
        initial={initialOf(member)}
        isCompleted={isCompleted}
        style={{
          cursor: allowTouch ? 'pointer' : 'default',
          transform: pressedKey === key ? 'scale(0.92)' : undefined,
          transition: 'transform 80ms ease-out',
          // A long press must not select the dot or open the browser's copy sheet.
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          touchAction: 'pan-y',
        }}
      />
    );
  }

  function renderRow(item: BonusItem, i: number) {
    const { chore, grab } = item;
    const holder = grab && grab.status !== 'open' ? memberMap.get(grab.memberId) : undefined;
    const done = grab ? grab.status === 'done' : item.eligibleIds.every((id) => item.doneIds.includes(id));
    return (
      <div
        key={chore.id}
        {...{ [CHORE_ROW_ATTR]: '' }}
        data-testid="chore-bonus-row"
        className="w-full flex items-center"
        // Under the compact grid a row lines up with the grid's own: no inset,
        // the same icon and the same 8px beside it.
        style={{ padding: plain ? '0.35em 0' : '0.35em 0.6em', gap: plain ? 8 : '0.5em', borderTop: i > 0 ? `1px solid ${DIVIDER.subtle}` : 'none' }}
      >
        {chore.emoji && (
          <span className="shrink-0"><ChoreIcon value={chore.emoji} size={plain ? choreIconSize(fontSize) : Math.round(fontSize * 0.9)} color="currentColor" /></span>
        )}
        <span className="flex-1 truncate" style={{ opacity: done ? 0.45 : 1 }}>{chore.name}</span>
        {showsTicketValue(config.showPoints, chore.points) && <TicketValue points={chore.points} />}
        <span className="shrink-0 flex items-center" style={{ gap }}>
          {grab ? (
            holder ? (
              <>
                {/* A plain ring reads as "this is Cleo's chore"; a grab says so in words. */}
                {/* Done on an earlier day this week: say which, or it reads as done today. */}
                {(grab.status === 'grabbed' || (grab.status === 'done' && grab.date !== today)) && (
                  <span className="shrink-0" style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.secondary }}>
                    {grab.status === 'grabbed'
                      ? t('chore-chart.bonus.onIt', { name: holder.name })
                      : didItOn(holder.name, grab.status === 'done' ? grab.date : today)}
                  </span>
                )}
                <MemberDot title={holder.name} size={dotSize} color={holder.color} initial={initialOf(holder)} isCompleted={grab.status === 'done'} />
              </>
            ) : (
              <span
                className="shrink-0 uppercase"
                style={{ fontSize: '0.5em', fontWeight: 700, letterSpacing: '0.08em', color: accentColor, padding: '0.3em 0.6em', borderRadius: 999, border: `1px dashed ${accentColor}` }}
              >
                {t('chore-chart.bonus.upForGrabs')}
              </span>
            )
          ) : (
            item.eligibleIds.map((id) => renderDot(item, id))
          )}
        </span>
      </div>
    );
  }

  const heading = (
    <>
      <span>✋</span>
      <span>{t('chore-chart.bonus.heading')}</span>
    </>
  );
  const rows = ordered.map(renderRow);

  if (variant === 'section') {
    return (
      <div data-testid="chore-bonus-section">
        <div className="flex items-center gap-1.5 mb-1" style={{ fontSize: '0.85em', fontWeight: 600, color: accentColor }}>{heading}</div>
        <div className="rounded-lg overflow-hidden" style={{ backgroundColor: ink(0.04) }}>{rows}</div>
      </div>
    );
  }
  // The heading is `BONUS_HEAD_EM` tall whatever the type does: a 0.85em line
  // at 1.5 (1.275em) and 0.25em + 0.25em of its own margin (0.425em).
  return (
    <div data-testid="chore-bonus-section" className="shrink-0">
      <div className="flex items-center gap-1.5" style={{ fontSize: '0.85em', lineHeight: 1.5, fontWeight: 600, color: accentColor, margin: '0.25em 0' }}>{heading}</div>
      {variant === 'strip'
        ? <div className="rounded-lg overflow-hidden" style={{ backgroundColor: ink(0.04) }}>{rows}</div>
        : rows}
    </div>
  );
}

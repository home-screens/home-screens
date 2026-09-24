'use client';

import { useMemo } from 'react';
import type { FamilyGroup, FamilyMember } from '@/types/family';

import type { ChoreChartConfig, ChoreTimeOfDay} from '@/types/config';
import type { ResolvedAssignment, MemberStats } from '../types';
import { bonusDisplayOrder, type BonusItem } from '@/lib/chore-bonus';
import { TIME_OF_DAY_META, getCurrentTimeOfDay, parseISO } from '../types';
import { buildChoreRows, getUniqueInitials, type ChoreRow } from '@/lib/chore-rows';
import { TEXT_OPACITY, DIVIDER, ink } from '@/lib/constants';
import { createTZDate, formatDateInTZ, isoDateInTZ } from '@/lib/timezone';
import { useTranslate, useFormattingLocale } from '@/i18n';
import ChoreIcon from '../ChoreIcon';
import MemberDot from '../../shared/MemberDot';
import { choreDotGap, choreDotSize } from '../layout';
import { CHORE_ROW_ATTR, FitRows } from '../FitRows';
import { usePressedKey } from '../../shared/usePressedKey';
import { useHoldToUncheck } from '@/hooks/useHoldToUncheck';
import { HoldHint, HoldProgress, TicketValue, showsTicketValue } from '../ChoreRowExtras';

interface TodayViewProps {
  config: ChoreChartConfig;
  data: {
    members: FamilyMember[];
    groups?: readonly FamilyGroup[];
    todayAssignments: ResolvedAssignment[];
    /** Today's bonus chores; they follow the regular ones and never count. */
    todayBonus?: BonusItem[];
    /** The hub's calendar day. */
    today?: string;
    todayKnown?: boolean;
    memberStats: Map<string, MemberStats>;
    toggleComplete: (choreId: string, memberId: string) => Promise<unknown>;
  };
  timezone?: string;
  /** Fitted module font size: the row's dots scale with it. */
  fontSize: number;
}

const TIME_SECTIONS: ChoreTimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];

export function TodayView({ config, data, timezone, fontSize }: TodayViewProps) {
  const { todayAssignments, members, toggleComplete } = data;
  const allowTouch = config.allowDisplayComplete;
  const [pressedKey, press] = usePressedKey();
  // Ticking is one tap; un-ticking takes a press and hold, the same gesture
  // the kid tablet asks for.
  const hold = useHoldToUncheck();
  const accentColor = config.accentColor ?? '#f59e0b';
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  // `tzNow` is a "shifted" Date whose local-time methods (getHours, getDay…)
  // reflect the configured IANA timezone — used by `getCurrentTimeOfDay`
  // which reads `getHours()`. `formatDateInTZ` does its own zone shift via
  // `Intl.DateTimeFormat`, so it must receive a real UTC instant; passing
  // `tzNow` would shift twice and yield the wrong weekday near midnight.
  const tzNow = createTZDate(timezone);
  const currentTime = getCurrentTimeOfDay(tzNow.getHours());

  // The hub's day, as the chores listed are; the household's own clock only
  // until the hub has answered.
  const today = data.today ?? isoDateInTZ(new Date(), timezone);
  // Blank until the hub has said which day it is (see the wall's header).
  const dayName = data.todayKnown === false ? '\u00a0' : formatDateInTZ(parseISO(today), undefined, { weekday: 'long' }, locale);
  // A "not today" is owed by nobody, so it is out of the progress sum.
  const owed = todayAssignments.filter((a) => !a.isSkipped);
  const totalAssigned = owed.length;
  const totalDone = owed.filter((a) => a.isCompleted).length;
  // Grabbed first, finished last: the order the wall's band uses.
  const todayBonus = bonusDisplayOrder(data.todayBonus ?? []);
  const formatDay = (iso: string) => parseISO(iso).toLocaleDateString(locale, { weekday: 'long' });

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const memberOrder = useMemo(() => new Map(members.map((m, i) => [m.id, i])), [members]);
  const initials = useMemo(() => getUniqueInitials(members), [members]);
  // One row per chore with a dot per person, rather than one row per person
  // per chore: five kids on "Make your bed" is one row, not five.
  const byTime = useMemo(
    () => buildChoreRows(todayAssignments, memberOrder, data.groups ?? []),
    [todayAssignments, memberOrder, data.groups],
  );

  const dotSize = choreDotSize(fontSize);
  const gap = choreDotGap(dotSize);

  /**
   * `touch` is off for a dot that is not undone from here. `doneEarlier`
   * labels one done on another day this week, drawn fainter, as on the wall.
   */
  function renderDot(row: ChoreRow, assignee: ChoreRow['assignees'][number], touch = allowTouch, doneEarlier?: string) {
    const member = memberMap.get(assignee.memberId);
    if (!member) return null;
    const key = `${row.choreId}:${assignee.memberId}`;
    if (doneEarlier) {
      return (
        <MemberDot
          key={key}
          role="img"
          aria-label={doneEarlier}
          title={doneEarlier}
          size={dotSize}
          color={member.color}
          initial={initials.get(member.id) ?? member.name.slice(0, 1)}
          isCompleted
          style={{ opacity: 0.72 }}
        />
      );
    }
    // Marked "not today" on the phone: a dashed ring, nothing to tap.
    if (assignee.isSkipped) {
      return (
        <MemberDot
          key={key}
          data-testid="chore-assignee-dot-skipped"
          title={member.name}
          size={dotSize}
          color={member.color}
          initial={initials.get(member.id) ?? member.name.slice(0, 1)}
          isCompleted={false}
          isSkipped
        />
      );
    }
    // A finished dot is the one a passing tap must not undo.
    const holdMode = touch && assignee.isCompleted;
    const handlers = touch
      ? hold.rowHandlers(key, holdMode, () => { void press(key, () => toggleComplete(row.choreId, assignee.memberId)); })
      : undefined;

    return (
      <MemberDot
        key={key}
        {...handlers}
        data-testid="chore-assignee-dot"
        role={touch ? 'button' : undefined}
        tabIndex={touch ? 0 : undefined}
        aria-pressed={touch ? assignee.isCompleted : undefined}
        aria-label={touch
          ? t(assignee.isCompleted ? 'chore-chart.ariaLabels.undoChore' : 'chore-chart.ariaLabels.completeChore',
              { chore: row.choreName, member: member.name })
          : undefined}
        title={member.name}
        size={dotSize}
        color={member.color}
        initial={initials.get(member.id) ?? member.name.slice(0, 1)}
        isCompleted={assignee.isCompleted}
        style={{
          cursor: touch ? 'pointer' : 'default',
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

  function renderRow(row: ChoreRow, i: number) {
    // The group's people sit together inside one labelled pill; anyone named
    // on top of the group follows outside it.
    const inGroup = row.assignees.filter((a) => a.viaGroup);
    const named = row.assignees.filter((a) => !a.viaGroup);
    const holdingHere = row.assignees.some((a) => hold.hintKey === `${row.choreId}:${a.memberId}`);
    const holding = row.assignees.find((a) => hold.holdingKey === `${row.choreId}:${a.memberId}`);
    const holdColor = holding ? memberMap.get(holding.memberId)?.color ?? accentColor : accentColor;

    return (
      <div
        key={row.choreId}
        {...{ [CHORE_ROW_ATTR]: '' }}
        className="w-full flex items-center"
        style={{
          position: 'relative',
          padding: '0.35em 0.6em',
          gap: '0.5em',
          borderTop: i > 0 ? `1px solid ${DIVIDER.subtle}` : 'none',
        }}
      >
        {holding && <HoldProgress progress={hold.progress} color={holdColor} />}
        {row.choreEmoji && (
          <span className="shrink-0"><ChoreIcon value={row.choreEmoji} size={Math.round(fontSize * 0.9)} color="currentColor" /></span>
        )}
        <span
          className="flex-1 truncate"
          style={{ opacity: row.assignees.every((a) => a.isCompleted || a.isSkipped) && !holdingHere ? 0.45 : 1 }}
        >
          {holdingHere ? <HoldHint color={holdColor} /> : row.choreName}
        </span>
        {showsTicketValue(config.showPoints, row.points) && <TicketValue points={row.points} />}
        <span className="shrink-0 flex items-center" style={{ gap }}>
          {inGroup.length > 0 && (
            <span
              className="flex items-center"
              style={{
                gap,
                backgroundColor: ink(0.09),
                borderRadius: 999,
                padding: `${Math.round(dotSize * 0.09)}px ${Math.round(dotSize * 0.11)}px`,
              }}
            >
              <span
                className="shrink-0 uppercase"
                style={{ fontSize: '0.5em', fontWeight: 700, letterSpacing: '0.08em', opacity: TEXT_OPACITY.secondary, paddingLeft: '0.3em' }}
              >
                {row.groupLabel}{row.groupExtra ? ` +${row.groupExtra}` : ''}
              </span>
              {inGroup.map((a) => renderDot(row, a))}
            </span>
          )}
          {named.map((a) => renderDot(row, a))}
        </span>
      </div>
    );
  }

  // A bonus chore on the card: read-only for up-for-grabs (grabbing needs the
  // picker the wall and the phone have), one dot per person for everyone-can.
  function renderBonusRow(item: BonusItem, i: number) {
    const { chore, grab } = item;
    const holder = grab && grab.status !== 'open' ? memberMap.get(grab.memberId) : undefined;
    const done = grab ? grab.status === 'done' : item.eligibleIds.every((id) => item.doneIds.includes(id));
    return (
      <div
        key={chore.id}
        {...{ [CHORE_ROW_ATTR]: '' }}
        className="w-full flex items-center"
        style={{ padding: '0.35em 0.6em', gap: '0.5em', borderTop: i > 0 ? `1px solid ${DIVIDER.subtle}` : 'none' }}
      >
        {chore.emoji && (
          <span className="shrink-0"><ChoreIcon value={chore.emoji} size={Math.round(fontSize * 0.9)} color="currentColor" /></span>
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
                      : t('chore-chart.bonus.didItOn', { name: holder.name, day: formatDay(grab.status === 'done' ? grab.date : today) })}
                  </span>
                )}
                <MemberDot
                  title={holder.name}
                  size={dotSize}
                  color={holder.color}
                  initial={initials.get(holder.id) ?? holder.name.slice(0, 1)}
                  isCompleted={grab.status === 'done'}
                />
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
            item.eligibleIds.map((id) => renderDot(
              { choreId: chore.id, choreName: chore.name, choreEmoji: chore.emoji, timeOfDay: chore.timeOfDay, points: chore.points, assignees: [] },
              { memberId: id, isCompleted: item.doneIds.includes(id) },
              // Done on another day this week: theirs, and not undone from here.
              allowTouch && (item.doneOn[id] === undefined || item.doneOn[id] === today),
              item.doneOn[id] !== undefined && item.doneOn[id] !== today
                ? t('chore-chart.bonus.didItOn', { name: memberMap.get(id)?.name ?? '', day: formatDay(item.doneOn[id]) })
                : undefined,
            ))
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ fontSize: 'inherit' }}>
      {/* Header */}
      {config.showTitle !== false && (
        <div className="text-center mb-2">
          <div style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.dim }}>&#128203; {tCore('today')}</div>
          <div style={{ fontSize: '0.85em', fontWeight: 600 }}>{dayName}</div>
        </div>
      )}

      {/* Time sections */}
      <FitRows className="space-y-2">
        {TIME_SECTIONS.map((section) => {
          const rows = byTime.get(section) ?? [];
          if (rows.length === 0) return null;

          const meta = TIME_OF_DAY_META[section];
          const isCurrent = section === currentTime;
          const sectionDone = rows.every((row) => row.assignees.every((a) => a.isCompleted || a.isSkipped));
          const isPast = meta.order < TIME_OF_DAY_META[currentTime].order;

          return (
            <div key={section}>
              {/* Section header */}
              <div
                className="flex items-center gap-1.5 mb-1"
                style={{
                  fontSize: '0.85em',
                  fontWeight: isCurrent ? 700 : 500,
                  opacity: isPast && sectionDone ? TEXT_OPACITY.tertiary : isCurrent ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary,
                  color: isCurrent ? accentColor : undefined,
                }}
              >
                <span>{meta.icon}</span>
                <span>{t(`chore-chart.timeOfDay.${section}`)}</span>
                {sectionDone && isPast && <span style={{ marginLeft: 'auto' }}>{'✓'}</span>}
              </div>

              {/* Chore rows */}
              <div
                className="rounded-lg overflow-hidden"
                style={{ backgroundColor: ink(0.04) }}
              >
                {rows.map(renderRow)}
              </div>
            </div>
          );
        })}

        {todayBonus.length > 0 && (
          <div data-testid="chore-bonus-section">
            <div className="flex items-center gap-1.5 mb-1" style={{ fontSize: '0.85em', fontWeight: 600, color: accentColor }}>
              <span>✋</span>
              <span>{t('chore-chart.bonus.heading')}</span>
            </div>
            <div className="rounded-lg overflow-hidden" style={{ backgroundColor: ink(0.04) }}>
              {todayBonus.map((item, i) => renderBonusRow(item, i))}
            </div>
          </div>
        )}
      </FitRows>

      {/* Progress bar */}
      <div className="mt-2">
        <div className="flex items-center gap-2" style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.dim }}>
          <span>{t('chore-chart.progressLabel')}</span>
          <div className="flex-1">
            <div
              className="rounded-full overflow-hidden"
              style={{ height: '0.4em', backgroundColor: DIVIDER.default }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: totalAssigned > 0 ? `${(totalDone / totalAssigned) * 100}%` : '0%',
                  backgroundColor: accentColor,
                }}
              />
            </div>
          </div>
          {/* Everything "not today" leaves nothing to count: that is a day off, not 0/0. */}
          <span>{totalAssigned === 0 && todayAssignments.length > 0 ? t('chore-chart.dayOff') : t('chore-chart.doneFraction', { done: totalDone, total: totalAssigned })}</span>
        </div>
      </div>
    </div>
  );
}

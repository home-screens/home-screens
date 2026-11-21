'use client';

import { useEffect, useState } from 'react';
import { Sunrise, Sun, Sunset, Clock, Hand, ChevronRight, Flame, Star } from 'lucide-react';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type { ChoreDefinition, ChoreTimeOfDay } from '@/types/config';
import { CHORE_TIME_ORDER } from '@/lib/chore-rows';
import { completionKey } from '@/lib/chore-assignments';
import { canPutBack, type BonusItem } from '@/lib/chore-bonus';
import type { RewardDefinition } from '@/lib/reward-data';
import type { GoalProgress } from '@/lib/reward-rules';
import { getTimeOfDayLabelKey } from '@/components/modules/chore-chart/types';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';
import { ticketWords } from './ticket-words';
import MemberPills from './MemberPills';
import ChoreHistoryNav from './ChoreHistoryNav';
import ChoreHistoryBanner from './ChoreHistoryBanner';
import ChoreRow, { type ChoreRowAssignment } from './ChoreRow';
import BonusChoreRow from './BonusChoreRow';
import DayCompleteSheet from './DayCompleteSheet';
import type { ChoreRowNotice } from '../hooks/useChoreMarks';
import { REMOTE_ACCENT } from './remote-styles';
import { addIsoDays } from '@/lib/iso-date';

const TOD_ICONS: Record<ChoreTimeOfDay, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  anytime: Clock,
};

/** "Show time of day" off: every chore in one list, no headings. */
const ONE_LIST: readonly null[] = [null];

/** One of the person's chores on the day, as the row draws it. */
export interface TodayAssignment extends ChoreRowAssignment {
  timeOfDay: ChoreTimeOfDay;
  steps: string[];
}

/** The "all done" sheet, with the day's numbers as they stood at the tick that finished it. */
export interface DayCelebration {
  memberId: string;
  done: number;
  total: number;
  tickets: number;
  /** Days in a row counting this one; null when it is not a streak yet or streaks are off. */
  streak: number | null;
  key: number;
}

/** The picked person's week: a star per day, and their run of finished days (0 when streaks are off). */
export interface WeekLine {
  days: { date: string; earned: boolean; isToday: boolean }[];
  streak: number;
}

interface ChoresTodayViewProps {
  isAdmin: boolean;
  accentColor: string;
  showPoints: boolean;
  /** Off, the day is one list with no Morning / Afternoon / Evening headings, as on the wall. */
  showTimeOfDay: boolean;
  /** Null for someone with no chores this week. */
  weekLine: WeekLine | null;
  /** The ticket count beside the progress header; `balances` is null until the rewards have been read. */
  showBalances: boolean;
  balances: Record<string, number> | null;
  members: FamilyMember[];
  groups: FamilyGroup[];
  chores: ChoreDefinition[];
  completionSet: Set<string>;
  viewingDate: string;
  realToday: string;
  onSelectDay: (date: string) => void;
  isViewingPast: boolean;
  /** Whether rows can be ticked: kids cannot change an earlier day. */
  canEdit: boolean;
  /** Morning, afternoon or evening at home, lit up in the list. */
  currentTimeOfDay: ChoreTimeOfDay;
  selectedMemberId: string;
  selectedMember: FamilyMember | undefined;
  onSelectMember: (id: string) => void;
  /** Per-member done and owed counts on the day, for the ✓ on each name. */
  memberTabStats: Record<string, { total: number; done: number }>;
  assignments: TodayAssignment[];
  /** Owed chores (not "not today") and how many are done. */
  totalDone: number;
  totalCount: number;
  bonusItems: BonusItem[];
  selectedAtLimit: boolean;
  grabLimit: number;
  celebration: DayCelebration | null;
  onCloseCelebration: () => void;
  /** What they are saving for, and how far along they are; absent without a goal. */
  goal: RewardDefinition | null;
  goalState: GoalProgress | null;
  onOpenRewards: () => void;
  /** Rows with a write out, by `completionKey` for a tick and `bonus-<choreId>` for the rest. */
  busy: ReadonlySet<string>;
  rowNotice: ChoreRowNotice | null;
  onToggle: (choreId: string) => void;
  /** A grown-up's tap on a "not today" takes the mark away. */
  onUndoNotToday: (choreId: string) => void;
  onGrab: (choreId: string) => void;
  onLetGo: (choreId: string) => void;
  onLimitTap: (choreId: string) => void;
  onPutBack: (choreId: string) => void;
  /** Whether the grown-up's menu has anything to offer for a chore; then the row has a ••• and a hold. */
  hasMenu: (choreId: string) => boolean;
  onOpenMenu: (choreId: string) => void;
}

/**
 * The Today view: who the chart is for, the day switch, progress, the chores
 * by time of day and the bonus chores. Drawn for a grown-up on /remote and
 * for a kid on /chores; what each may do comes in as props.
 */
export default function ChoresTodayView({
  isAdmin, accentColor, showPoints, showTimeOfDay, weekLine, showBalances, balances,
  members, groups, chores, completionSet,
  viewingDate, realToday, onSelectDay, isViewingPast, canEdit, currentTimeOfDay,
  selectedMemberId, selectedMember, onSelectMember, memberTabStats,
  assignments, totalDone, totalCount, bonusItems, selectedAtLimit, grabLimit,
  celebration, onCloseCelebration, goal, goalState, onOpenRewards,
  busy, rowNotice, onToggle, onUndoNotToday, onGrab, onLetGo, onLimitTap, onPutBack, hasMenu, onOpenMenu,
}: ChoresTodayViewProps) {
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  const checkedColor = selectedMember?.color ?? accentColor;
  const balance = balances?.[selectedMemberId] ?? 0;
  // Someone with only bonus chores has nothing to count at all.
  const onlyBonus = assignments.length === 0 && bonusItems.length > 0;
  const yesterday = addIsoDays(realToday, -1);
  const noticeFor = (choreId: string) =>
    rowNotice && rowNotice.choreId === choreId && rowNotice.memberId === selectedMemberId && rowNotice.date === viewingDate ? rowNotice.text : null;

  // Which chores have their steps open under the row, for the person and day
  // they were opened on. Several may be open: closing one as another opens
  // moved the rows under the finger.
  const [openSteps, setOpenSteps] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => { setOpenSteps(new Set()); }, [selectedMemberId, viewingDate]);

  const renderRow = (assignment: TodayAssignment) => {
    const key = completionKey(assignment.choreId, selectedMemberId, viewingDate);
    const menu = isAdmin && canEdit ? () => onOpenMenu(assignment.choreId) : undefined;
    return (
      <ChoreRow
        key={assignment.choreId}
        assignment={assignment}
        isToggling={busy.has(key)}
        readOnly={!canEdit}
        holdToUncheck={!isAdmin}
        checkedColor={checkedColor}
        showPoints={showPoints}
        onToggle={() => {
          if (assignment.isSkipped) onUndoNotToday(assignment.choreId);
          else onToggle(assignment.choreId);
        }}
        onLongPress={menu}
        onMenu={menu}
        view={`${selectedMemberId}:${viewingDate}`}
        notice={noticeFor(assignment.choreId)}
        steps={assignment.steps}
        stepsOpen={openSteps.has(assignment.choreId)}
        onToggleSteps={() => setOpenSteps((open) => {
          const next = new Set(open);
          if (next.has(assignment.choreId)) next.delete(assignment.choreId);
          else next.add(assignment.choreId);
          return next;
        })}
      />
    );
  };

  const allDoneFor = (memberId: string): boolean => {
    const stats = memberTabStats[memberId];
    return (stats?.total ?? 0) > 0 && stats?.done === stats?.total;
  };

  return (
    <>
      {isAdmin ? (
        <ChoreHistoryNav
          viewingDate={viewingDate}
          realToday={realToday}
          members={members}
          groups={groups}
          chores={chores}
          completionSet={completionSet}
          accentColor={accentColor}
          onSelect={onSelectDay}
        />
      ) : (
        /* Kids get yesterday and today, not a 90-day strip: yesterday is
           read-only for them anyway, so there is nothing further back a
           kid can act on, and the strip was the biggest thing on the page. */
        <div
          role="group"
          aria-label={t('choresTab.dayToggle.ariaLabel')}
          style={{
            display: 'inline-flex',
            gap: 2,
            padding: 3,
            background: 'var(--hs-bg-card)',
            borderRadius: 10,
            marginTop: 4,
          }}
        >
          {([
            { date: yesterday, label: t('choresTab.dayToggle.yesterday') },
            { date: realToday, label: t('choresTab.dayToggle.today') },
          ] as const).map(({ date, label }) => {
            const active = viewingDate === date;
            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelectDay(date)}
                aria-pressed={active}
                style={{
                  padding: '6px 14px',
                  minHeight: 44,
                  minWidth: 44,
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: active ? 'var(--hs-bg-hover)' : 'transparent',
                  color: active ? 'var(--hs-text-body)' : 'var(--hs-text-faint)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* History banner: visible only when the user has navigated away from today */}
      {isViewingPast && (
        <div style={{ marginTop: 10 }}>
          <ChoreHistoryBanner viewingDate={viewingDate} canEdit={canEdit} />
        </div>
      )}

      {/* Phones stack the member pills above the list; from 768px up the
          members become a left column and the chores take the rest. */}
      <div className="md:flex md:items-start md:gap-6">
        <MemberPills
          members={members}
          selectedId={selectedMemberId}
          onSelect={onSelectMember}
          className="md:w-56 md:shrink-0 md:flex-col md:sticky md:top-4"
          pillClassName="md:w-full"
          ariaLabel={(member) => (allDoneFor(member.id)
            ? t('choresTab.memberAriaLabelAllDone', { name: member.name })
            : t('choresTab.memberAriaLabel', { name: member.name }))}
          trailing={(member) => allDoneFor(member.id) && <span style={{ fontSize: 12, lineHeight: 1, marginLeft: -2, flexShrink: 0 }}>&#10003;</span>}
        />

        <div className="md:flex-1 md:min-w-0">
          {celebration && selectedMember && selectedMember.id === celebration.memberId && (
            <DayCompleteSheet
              key={celebration.key}
              member={selectedMember}
              done={celebration.done}
              total={celebration.total}
              tickets={celebration.tickets}
              streak={celebration.streak}
              onClose={onCloseCelebration}
              modal={!isAdmin}
            />
          )}

          <div style={{ padding: '0 0 12px' }}>
            {/* A fixed height: "All done!" and the ticket count changing must
                not nudge the list under a finger. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, height: 26 }}>
              <span style={{ fontSize: 13, color: 'var(--hs-text-faint)' }}>
                {/* Everything "not today" leaves nothing to count: a day off, not 0/0. */}
                {totalCount === 0 && assignments.length > 0
                  ? tModules('chore-chart.dayOff')
                  : onlyBonus ? null : t('choresTab.progress.completion', { done: totalDone, total: totalCount })}
                {totalCount > 0 && totalDone === totalCount && (
                  <span style={{ color: 'var(--hs-success)', fontWeight: 500, marginLeft: 8 }}>{t('choresTab.progress.allDone')}</span>
                )}
              </span>
              {showBalances && balances !== null && (
                <span
                  key={balance}
                  className="hs-pulse-once"
                  data-testid="ticket-balance"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    color: checkedColor,
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  <span aria-hidden="true">🎟</span>
                  <span>
                    {ticketWords(t, balance, 'choresTab')}
                  </span>
                </span>
              )}
            </div>
            {!onlyBonus && <div style={{ height: 8, background: 'var(--hs-border)', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 4,
                  width: totalCount > 0 ? `${(totalDone / totalCount) * 100}%` : '0%',
                  backgroundColor: checkedColor,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>}
            {/* This week's stars and the run of finished days, as the wall's
                chip shows them. A fixed height, and only on today: the run
                ends today, so beside an earlier day it would be about another one. */}
            {weekLine && !isViewingPast && (
              <div data-testid="today-week-line" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: 28, marginTop: 6 }}>
                <span
                  role="img"
                  aria-label={`${tModules('chore-chart.thisWeek')}: ${weekLine.days.filter((day) => day.earned).length}/${weekLine.days.length}`}
                  style={{ display: 'inline-flex', gap: 5 }}
                >
                  {weekLine.days.map((day) => (
                    <Star
                      key={day.date}
                      size={17}
                      aria-hidden
                      // Today's star, still unearned, is an outline: the one up for grabs.
                      color={day.earned ? checkedColor : day.isToday ? accentColor : 'var(--hs-border)'}
                      fill={day.earned ? checkedColor : day.isToday ? 'transparent' : 'var(--hs-border)'}
                      strokeWidth={day.earned || !day.isToday ? 0 : 2}
                    />
                  ))}
                </span>
                {weekLine.streak >= 2 && (
                  <span data-testid="today-streak" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: accentColor, whiteSpace: 'nowrap' }}>
                    <Flame size={15} aria-hidden />
                    {tModules('chore-chart.streakDays', { count: weekLine.streak })}
                  </span>
                )}
              </div>
            )}
            {/* What they are saving for, as one fixed-height line: icon, name,
                bar, how far to go. A tap opens Rewards. Fixed so it never
                nudges the list, and absent rather than empty without a goal. */}
            {goal && goalState && (
              <button
                type="button"
                data-testid="today-goal-line"
                className="press-scale"
                onClick={onOpenRewards}
                aria-label={t('choresTab.goalLine.ariaLabel', { name: goal.name })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 44, marginTop: 4,
                  background: 'none', border: 'none', padding: 0, color: 'var(--hs-text-muted)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                  <ChoreIcon value={goal.emoji} size={16} color={checkedColor} />
                </span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '48%' }}>
                  {t('choresTab.goalLine.label', { name: goal.name })}
                </span>
                <span style={{ flex: 1, height: 5, background: 'var(--hs-border)', borderRadius: 9, overflow: 'hidden', minWidth: 24 }}>
                  <span style={{ display: 'block', height: '100%', borderRadius: 9, background: checkedColor, width: `${goalState.fraction * 100}%`, transition: 'width 0.3s ease' }} />
                </span>
                <span style={{ whiteSpace: 'nowrap', flexShrink: 0, color: goalState.reached ? checkedColor : undefined, fontWeight: goalState.reached ? 600 : 400 }}>
                  {goalState.reached
                    ? t('choresTab.goalLine.ready')
                    : goalState.stillNeeded === 1
                      ? t('choresTab.goalLine.moreToGoSingular', { n: goalState.stillNeeded })
                      : t('choresTab.goalLine.moreToGoPlural', { n: goalState.stillNeeded })}
                </span>
                <ChevronRight size={16} aria-hidden style={{ flexShrink: 0, color: 'var(--hs-text-faint)' }} />
              </button>
            )}
          </div>

          <div style={{ paddingBottom: 80 }}>
            {assignments.length === 0 && bonusItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <p style={{ fontSize: 14, color: 'var(--hs-text-faint)' }}>{t('choresTab.noChoresToday')}</p>
              </div>
            )}

            {(showTimeOfDay ? CHORE_TIME_ORDER : ONE_LIST).map((section) => {
              // One list keeps the order it arrived in: morning first.
              const items = section === null ? assignments : assignments.filter((a) => a.timeOfDay === section);
              if (!items.length) return null;
              if (section === null) return <div key="all" data-testid="today-one-list" style={{ marginBottom: 16, paddingTop: 8 }}>{items.map(renderRow)}</div>;

              const TodIcon = TOD_ICONS[section];
              const isCurrent = !isViewingPast && section === currentTimeOfDay;
              const sectionAllDone = items.every((a) => a.isCompleted || a.isSkipped);

              return (
                <div key={section} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0' }}>
                    <TodIcon size={16} color={isCurrent ? accentColor : 'var(--hs-text-faint)'} strokeWidth={2} />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.08em',
                        color: isCurrent ? accentColor : 'var(--hs-text-faint)',
                      }}
                    >
                      {tModules(getTimeOfDayLabelKey(section))}
                    </span>
                    {/* lineHeight 1: the ✓ is taller than the label, and made the
                        heading grow, moving every row under it, when a section finished. */}
                    {sectionAllDone && (
                      <span style={{ marginLeft: 'auto', fontSize: 12, lineHeight: 1, color: 'var(--hs-success)' }}>&#10003;</span>
                    )}
                  </div>

                  {items.map(renderRow)}
                </div>
              );
            })}

            {bonusItems.length > 0 && (
              <div data-testid="bonus-section" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0 2px' }}>
                  <Hand size={16} color={REMOTE_ACCENT} strokeWidth={2} />
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: REMOTE_ACCENT }}>
                    {tModules('chore-chart.bonus.heading')}
                  </span>
                </div>
                {/* The hint says what to do; on a past day there is nothing to grab. */}
                {!isViewingPast && (
                  <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '0 0 8px' }}>{t('choresTab.bonus.sectionHint')}</p>
                )}
                {bonusItems.map((item) => {
                  const id = item.chore.id;
                  const menu = isAdmin && hasMenu(id) ? () => onOpenMenu(id) : undefined;
                  return (
                    <BonusChoreRow
                      key={id}
                      item={item}
                      memberId={selectedMemberId}
                      members={members}
                      date={viewingDate}
                      today={realToday}
                      canEdit={canEdit}
                      canGrab={!isViewingPast}
                      atLimit={selectedAtLimit}
                      grabLimit={grabLimit}
                      isBusy={busy.has(`bonus-${id}`) || busy.has(completionKey(id, selectedMemberId, viewingDate))}
                      holdToUncheck={!isAdmin}
                      checkedColor={checkedColor}
                      onTick={() => onToggle(id)}
                      onGrab={() => onGrab(id)}
                      onLimitTap={() => onLimitTap(id)}
                      onLetGo={() => onLetGo(id)}
                      notice={noticeFor(id)}
                      onLongPress={menu}
                      onMenu={menu}
                      onPutBack={isAdmin && !isViewingPast && canPutBack(item) ? () => onPutBack(id) : undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

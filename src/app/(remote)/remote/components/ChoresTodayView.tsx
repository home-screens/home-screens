'use client';

import { useEffect, useState } from 'react';
import { Sunrise, Sun, Sunset, Clock, Hand, ChevronRight } from 'lucide-react';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type { ChoreDefinition, ChoreTimeOfDay } from '@/types/config';
import { completionKey } from '@/lib/chore-assignments';
import { canPutBack, type BonusItem } from '@/lib/chore-bonus';
import { memberInitials } from '@/lib/family-avatar';
import type { RewardDefinition } from '@/lib/reward-data';
import type { GoalProgress } from '@/lib/reward-rules';
import { addDaysISO, getTimeOfDayLabelKey } from '@/components/modules/chore-chart/types';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';
import ChoreHistoryNav from './ChoreHistoryNav';
import ChoreHistoryBanner from './ChoreHistoryBanner';
import ChoreRow, { type ChoreRowAssignment } from './ChoreRow';
import BonusChoreRow from './BonusChoreRow';
import DayCompleteSheet from './DayCompleteSheet';
import type { ChoreRowNotice } from '../hooks/useChoreMarks';

const TOD_ICONS: Record<ChoreTimeOfDay, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  anytime: Clock,
};

const SECTIONS: readonly ChoreTimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];

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
  key: number;
}

interface ChoresTodayViewProps {
  isAdmin: boolean;
  accentColor: string;
  showPoints: boolean;
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
  isAdmin, accentColor, showPoints, showBalances, balances,
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
  const yesterday = addDaysISO(realToday, -1);
  const noticeFor = (choreId: string) =>
    rowNotice && rowNotice.choreId === choreId && rowNotice.memberId === selectedMemberId && rowNotice.date === viewingDate ? rowNotice.text : null;

  // Which chores have their steps open under the row, for the person and day
  // they were opened on. Several may be open: closing one as another opens
  // moved the rows under the finger.
  const [openSteps, setOpenSteps] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => { setOpenSteps(new Set()); }, [selectedMemberId, viewingDate]);

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
        <div
          className="md:w-56 md:shrink-0 md:flex-col md:sticky md:top-4"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 0' }}
        >
          {members.map((member) => {
            const isActive = member.id === selectedMemberId;
            const tabStats = memberTabStats[member.id];
            const allDone = (tabStats?.total ?? 0) > 0 && tabStats?.done === tabStats?.total;
            const initial = memberInitials(member.name);

            return (
              <button
                key={member.id}
                className="press-scale md:w-full"
                onClick={() => onSelectMember(member.id)}
                aria-label={
                  allDone
                    ? t('choresTab.memberAriaLabelAllDone', { name: member.name })
                    : t('choresTab.memberAriaLabel', { name: member.name })
                }
                aria-pressed={isActive}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  // A fixed height: the ✓ that appears when someone finishes
                  // is taller than the name, and grew the chip, moving the
                  // whole list under a finger.
                  height: 44,
                  maxWidth: '100%',
                  borderRadius: 999,
                  border: `2px solid ${isActive ? member.color : 'transparent'}`,
                  background: isActive ? `color-mix(in srgb, ${member.color} 15%, transparent)` : 'var(--hs-bg-card)',
                  color: isActive ? member.color : 'var(--hs-text-muted)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
              >
                {member.emoji ? (
                  <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                    <ChoreIcon value={member.emoji} size={18} color={isActive ? member.color : 'var(--hs-text-muted)'} fallback={<span style={{ fontSize: 16, fontWeight: 600 }}>{initial}</span>} />
                  </span>
                ) : (
                  <span style={{ fontSize: 16, fontWeight: 600, flexShrink: 0 }}>{initial}</span>
                )}
                {/* A very long name gets an ellipsis instead of pushing
                    every other member off the screen. */}
                <span
                  style={{
                    maxWidth: 140,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  {member.name}
                </span>
                {allDone && <span style={{ fontSize: 12, lineHeight: 1, marginLeft: -2, flexShrink: 0 }}>&#10003;</span>}
              </button>
            );
          })}
        </div>

        <div className="md:flex-1 md:min-w-0">
          {celebration && selectedMember && selectedMember.id === celebration.memberId && (
            <DayCompleteSheet
              key={celebration.key}
              member={selectedMember}
              done={celebration.done}
              total={celebration.total}
              tickets={celebration.tickets}
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
                    {balance === 1
                      ? t('choresTab.ticketCountSingular', { n: balance })
                      : t('choresTab.ticketCountPlural', { n: balance })}
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

            {SECTIONS.map((section) => {
              const items = assignments.filter((a) => a.timeOfDay === section);
              if (!items.length) return null;

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

                  {items.map((assignment) => {
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
                  })}
                </div>
              );
            })}

            {bonusItems.length > 0 && (
              <div data-testid="bonus-section" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0 2px' }}>
                  <Hand size={16} color="#f59e0b" strokeWidth={2} />
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#f59e0b' }}>
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

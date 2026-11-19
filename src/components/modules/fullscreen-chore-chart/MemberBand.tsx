'use client';

import type { FamilyMember } from '@/types/family';


import type { MemberStats, WeekDayData } from '@/components/modules/chore-chart/types';
import ChoreRowItem from './ChoreRowItem';
import type { MemberChipDetail } from './MemberStrip';
import type { RewardDefinition } from '@/lib/reward-data';
import GoalLine from './GoalLine';
import { MemberAvatar, MemberStatLine, WeekStars } from './member-bits';
import type { ToggleParams } from './helpers';
import type { ChoreRow } from '@/lib/chore-rows';

interface MemberBandHeaderProps {
  member: FamilyMember;
  stats: MemberStats | undefined;
  /** Band height in px, fixed by the name size. */
  height: number;
  /** Name size; the avatar and fraction are drawn relative to it. */
  fontSize: number;
  showStreaks: boolean;
  showPoints: boolean;
  weekData: WeekDayData[];
  /** `stars` draws the week's seven stars at the right edge, the way a member
   *  chip does; the chips are hidden in the by-person layout. */
  detail: MemberChipDetail;
  /** The reward this person is saving for, when the chart shows tickets. */
  goal?: RewardDefinition | null;
  /** Someone has a goal: a header without one keeps the row empty so names line up. */
  reserveGoalRow?: boolean;
  /**
   * Narrow column: the fraction goes under the name and the stars under the
   * bar, so the name is never the thing that gives way.
   */
  compact?: boolean;
  style?: React.CSSProperties;
}

/** Band height the header needs, as a multiple of the name size. */
export function memberHeaderHeight(fontSize: number, compact: boolean, withGoal = false): number {
  // The goal line is a stat-sized line plus its gap, added for every header
  // at once so the bands stay even.
  return fontSize * (compact ? 4.7 : 3.1) + (withGoal ? fontSize * 1.25 : 0);
}

/**
 * The section header of the by-person layout: avatar, name, today's
 * fraction, and the thin progress bar the member chip carries elsewhere. The
 * member strip is hidden in this layout, so this is where the numbers live.
 */
export function MemberBandHeader({ member, stats, height, fontSize, showStreaks, showPoints, weekData, detail, compact = false, style, goal, reserveGoalRow = false }: MemberBandHeaderProps) {
  const avatar = Math.min(height * 0.7, fontSize * 2);
  const statSize = fontSize * 0.75;
  const starSize = fontSize * 0.75;
  const stars = detail === 'stars' && (
    <WeekStars member={member} weekData={weekData} size={starSize} gap={starSize * 0.3} style={{ flexShrink: 0, marginTop: compact ? fontSize * 0.3 : 0 }} />
  );
  const stat = (
    <MemberStatLine stats={stats} size={statSize} gap={statSize * 0.4} showStreaks={showStreaks} showPoints={showPoints} doneColor={member.color} style={{ flexShrink: 0 }} />
  );
  return (
    <div
      data-testid="fcc-member-band"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: fontSize * 0.5,
        height,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <MemberAvatar member={member} size={avatar} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: fontSize * 0.5, minWidth: 0 }}>
          <span style={{ fontSize, fontWeight: 700, letterSpacing: '-0.01em', color: member.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: compact ? 1 : undefined }}>
            {member.name}
          </span>
          {!compact && stat}
        </div>
        {compact && <div style={{ marginTop: fontSize * 0.15 }}>{stat}</div>}
        <div style={{ height: Math.max(4, fontSize * 0.18), background: 'var(--fcc-border)', borderRadius: 999, marginTop: fontSize * 0.25, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, background: member.color, width: `${stats?.percentage ?? 0}%`, transition: 'width 0.5s ease' }} />
        </div>
        {showPoints && goal ? (
          <div style={{ marginTop: fontSize * 0.25 }}>
            <GoalLine goal={goal} balance={stats?.rewardBalance ?? 0} size={statSize} bar={false} />
          </div>
        ) : reserveGoalRow ? (
          // Every header keeps the row while anyone has a goal, so the names line up across the columns.
          <div aria-hidden style={{ marginTop: fontSize * 0.25, height: statSize * 1.3 }} />
        ) : null}
        {compact && stars}
      </div>
      {!compact && stars}
    </div>
  );
}

interface MemberBandProps {
  member: FamilyMember;
  stats: MemberStats | undefined;
  rows: ChoreRow[];
  /** Chore-name size for the rows. */
  fontSize: number;
  dotSize: number;
  rowHeight: number;
  headerHeight: number;
  /** Member-name size in the header band. */
  headerFontSize: number;
  rowWidth: number;
  /** Dots under the name on every row; see ChoreRowItem.stacked. */
  stacked?: boolean;
  /** Narrow band: see MemberBandHeader.compact. */
  compact?: boolean;
  showPoints: boolean;
  showStreaks: boolean;
  showTimeOfDay: boolean;
  weekData: WeekDayData[];
  detail: MemberChipDetail;
  /** The reward this person is saving for, when the chart shows tickets. */
  goal?: RewardDefinition | null;
  /** Someone has a goal: a header without one keeps the row empty so names line up. */
  reserveGoalRow?: boolean;
  memberMap: Map<string, FamilyMember>;
  initialsMap: Map<string, string>;
  allowTouch: boolean;
  onToggle: (params: ToggleParams) => void;
}

/** One member's section in the by-person layout. */
export default function MemberBand({
  member,
  stats,
  rows,
  fontSize,
  dotSize,
  rowHeight,
  headerHeight,
  headerFontSize,
  rowWidth,
  stacked = false,
  compact = false,
  showPoints,
  showStreaks,
  showTimeOfDay,
  weekData,
  detail,
  goal,
  reserveGoalRow = false,
  memberMap,
  initialsMap,
  allowTouch,
  onToggle,
}: MemberBandProps) {
  return (
    <div data-testid="fcc-member-section" style={{ flexShrink: 0 }}>
      <MemberBandHeader
        member={member}
        stats={stats}
        height={headerHeight}
        fontSize={headerFontSize}
        showStreaks={showStreaks}
        showPoints={showPoints}
        weekData={weekData}
        detail={detail}
        compact={compact}
        style={{ padding: `0 ${fontSize * 0.3}px ${headerFontSize * 0.2}px` }}
        goal={goal}
        reserveGoalRow={reserveGoalRow}
      />
      {rows.map((row, i) => (
        <ChoreRowItem
          key={row.choreId}
          row={row}
          fontSize={fontSize}
          dotSize={dotSize}
          rowHeight={rowHeight}
          rowWidth={rowWidth}
          stacked={stacked}
          showInitials={false}
          showTimeOfDay={showTimeOfDay}
          isFirst={i === 0}
          showPoints={showPoints}
          memberMap={memberMap}
          initialsMap={initialsMap}
          allowTouch={allowTouch}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

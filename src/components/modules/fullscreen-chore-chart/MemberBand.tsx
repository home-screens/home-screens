'use client';

import type { ChoreMember } from '@/types/config';
import type { MemberStats, WeekDayData } from '@/components/modules/chore-chart/types';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { Flame, Star, Ticket } from 'lucide-react';
import ChoreRowItem from './ChoreRowItem';
import type { MemberChipDetail } from './MemberStrip';
import type { ChoreRow, ToggleParams } from './helpers';

interface MemberBandHeaderProps {
  member: ChoreMember;
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
  /**
   * Narrow column: the fraction goes under the name and the stars under the
   * bar, so the name is never the thing that gives way.
   */
  compact?: boolean;
  style?: React.CSSProperties;
}

/** Band height the header needs, as a multiple of the name size. */
export function memberHeaderHeight(fontSize: number, compact: boolean): number {
  return fontSize * (compact ? 4.7 : 3.1);
}

/**
 * The section header of the by-person layout: avatar, name, today's
 * fraction, and the thin progress bar the member chip carries elsewhere. The
 * member strip is hidden in this layout, so this is where the numbers live.
 */
export function MemberBandHeader({ member, stats, height, fontSize, showStreaks, showPoints, weekData, detail, compact = false, style }: MemberBandHeaderProps) {
  const avatar = Math.min(height * 0.7, fontSize * 2);
  const statSize = fontSize * 0.75;
  const starSize = fontSize * 0.75;
  const done = stats?.completed ?? 0;
  const total = stats?.total ?? 0;
  const complete = total > 0 && done === total;
  const stars = detail === 'stars' && (
    <div data-testid="fcc-chip-stars" style={{ display: 'flex', gap: starSize * 0.3, flexShrink: 0, marginTop: compact ? fontSize * 0.3 : 0 }}>
      {weekData.map((day) => {
        const earned = day.memberStars[member.id];
        // Today's star, still unearned, is an accent outline: the one up for grabs.
        const fill = earned ? member.color : day.isToday ? 'transparent' : 'var(--fcc-border)';
        const stroke = earned ? member.color : day.isToday ? 'var(--fcc-accent)' : 'var(--fcc-border)';
        return (
          <Star
            key={day.date}
            size={starSize}
            color={stroke}
            fill={fill}
            strokeWidth={earned || !day.isToday ? 0 : 2}
            style={{ flexShrink: 0 }}
          />
        );
      })}
    </div>
  );
  const stat = (
    <span style={{ fontSize: statSize, fontWeight: 600, color: complete ? member.color : 'var(--fcc-text-2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: statSize * 0.4, flexShrink: 0 }}>
      <span>{done}/{total}</span>
      {showStreaks && stats && stats.streak > 0 && (
        <span style={{ color: 'var(--fcc-accent)', display: 'inline-flex', alignItems: 'center', gap: statSize * 0.1 }}>
          <Flame size={statSize} />{stats.streak}
        </span>
      )}
      {showPoints && (stats?.rewardBalance ?? 0) > 0 && (
        <span style={{ color: 'var(--fcc-accent)', display: 'inline-flex', alignItems: 'center', gap: statSize * 0.15 }}>
          <Ticket size={statSize} />{stats!.rewardBalance}
        </span>
      )}
    </span>
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
      <div
        style={{
          width: avatar,
          height: avatar,
          borderRadius: '50%',
          background: member.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'white',
        }}
      >
        <ChoreIcon value={member.emoji} size={avatar * 0.55} color="white" bare />
      </div>
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
        {compact && stars}
      </div>
      {!compact && stars}
    </div>
  );
}

interface MemberBandProps {
  member: ChoreMember;
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
  memberMap: Map<string, ChoreMember>;
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

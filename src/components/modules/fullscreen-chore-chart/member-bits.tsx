'use client';

import { Flame, Star, Ticket } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import type { MemberStats, WeekDayData } from '@/components/modules/chore-chart/types';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { memberInk } from '@/lib/family-avatar';

/**
 * The pieces the member chip and the by-person band header both draw: the
 * person's disc, their seven stars for the week, and the done / streak /
 * tickets line. Each caller passes its own sizes.
 */

/** The person's icon on a disc of their colour, in ink that reads on it. */
export function MemberAvatar({ member, size }: { member: FamilyMember; size: number }) {
  const ink = memberInk(member.color);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: member.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: ink,
      }}
    >
      <ChoreIcon value={member.emoji ?? ''} size={size * 0.55} color={ink} bare fallback={null} />
    </div>
  );
}

/** This week's seven stars for one person. */
export function WeekStars({ member, weekData, size, gap, style }: {
  member: FamilyMember;
  weekData: WeekDayData[];
  size: number;
  gap: number;
  style?: React.CSSProperties;
}) {
  return (
    <div data-testid="fcc-chip-stars" style={{ display: 'flex', gap, ...style }}>
      {weekData.map((day) => {
        const earned = day.memberStars[member.id];
        // Today's star, still unearned, is an accent outline: the one up for grabs.
        const fill = earned ? member.color : day.isToday ? 'transparent' : 'var(--fcc-border)';
        const stroke = earned ? member.color : day.isToday ? 'var(--fcc-accent)' : 'var(--fcc-border)';
        return (
          <Star
            key={day.date}
            size={size}
            color={stroke}
            fill={fill}
            strokeWidth={earned || !day.isToday ? 0 : 2}
            style={{ flexShrink: 0 }}
          />
        );
      })}
    </div>
  );
}

/** Done over owed, the streak and the ticket balance on one line. */
export function MemberStatLine({ stats, size, gap, showStreaks, showPoints, streakFirst = false, doneColor, style }: {
  stats: MemberStats | undefined;
  size: number;
  /** Space between the three, in px. */
  gap: number;
  showStreaks: boolean;
  showPoints?: boolean;
  /** The chip leads with the streak; the band header leads with the fraction. */
  streakFirst?: boolean;
  /** The line's colour once the day is finished; unset keeps it quiet. */
  doneColor?: string;
  style?: React.CSSProperties;
}) {
  const done = stats?.completed ?? 0;
  const total = stats?.total ?? 0;
  const complete = total > 0 && done === total;
  const streak = showStreaks && stats && stats.streak > 0 && (
    <span style={{ color: 'var(--fcc-accent)', display: 'inline-flex', alignItems: 'center', gap: size * 0.1 }}>
      <Flame size={size} />{stats.streak}
    </span>
  );
  return (
    <span style={{ fontSize: size, fontWeight: 600, color: complete && doneColor ? doneColor : 'var(--fcc-text-2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap, ...style }}>
      {streakFirst && streak}
      <span>{done}/{total}</span>
      {!streakFirst && streak}
      {showPoints && (stats?.rewardBalance ?? 0) > 0 && (
        <span style={{ color: 'var(--fcc-accent)', display: 'inline-flex', alignItems: 'center', gap: size * 0.15 }}>
          <Ticket size={size} />{stats!.rewardBalance}
        </span>
      )}
    </span>
  );
}

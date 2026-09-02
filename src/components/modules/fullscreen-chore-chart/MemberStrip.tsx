import type { ChoreMember } from '@/types/config';
import type { MemberStats, WeekDayData } from '@/components/modules/chore-chart/types';
import { balanceRows, fitPerRow } from '@/components/modules/chore-chart/layout';
import { Flame, Star } from 'lucide-react';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';

/**
 * What the bottom line of a member chip shows.
 * - `stars` this week's seven stars (the `chips` weekProgress mode)
 * - `bar`   today's completion bar (every other mode, where the week lives
 *           elsewhere or nowhere)
 */
export type MemberChipDetail = 'stars' | 'bar';

interface MemberChipProps {
  member: ChoreMember;
  stats: MemberStats | undefined;
  weekData: WeekDayData[];
  detail: MemberChipDetail;
  /** Chip scale: 1 = the sizes authored for a 1080-wide panel. */
  c: number;
  showStreaks: boolean;
  showPoints?: boolean;
}

function MemberChip({ member, stats, weekData, detail, c, showStreaks, showPoints }: MemberChipProps) {
  const avatar = 68 * c;
  const nameSize = 28 * c;
  const statSize = 21 * c;
  const starSize = 22 * c;

  return (
    <div
      data-testid="fcc-member-chip"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16 * c,
        padding: `${16 * c}px ${18 * c}px`,
        background: 'var(--fcc-surface)',
        borderRadius: 20 * c,
        boxShadow: 'var(--fcc-card-shadow)',
        minWidth: 0,
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
        }}
      >
        <ChoreIcon value={member.emoji} size={avatar * 0.5} color="white" />
      </div>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ fontSize: nameSize, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fcc-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {member.name}
        </div>
        <div style={{ fontSize: statSize, color: 'var(--fcc-text-2)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', marginTop: 2 * c }}>
          {showStreaks && stats && stats.streak > 0 && (
            <span style={{ color: 'var(--fcc-accent)' }}>
              <Flame size={statSize} style={{ display: 'inline', verticalAlign: '-0.1em' }} /> {stats.streak}
              <span style={{ color: 'var(--fcc-text-2)', margin: `0 ${4 * c}px` }}>&middot;</span>
            </span>
          )}
          {stats?.completed ?? 0}/{stats?.total ?? 0}
          {showPoints && (stats?.rewardBalance ?? 0) > 0 && (
            <span style={{ color: '#a78bfa' }}> · 🎟️{stats!.rewardBalance}</span>
          )}
        </div>
        {detail === 'stars' ? (
          <div data-testid="fcc-chip-stars" style={{ display: 'flex', gap: 7 * c, marginTop: 8 * c }}>
            {weekData.map((day) => {
              const earned = day.memberStars[member.id];
              // Today's star, still unearned, is drawn as an accent outline so
              // the kid can see which one is up for grabs.
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
        ) : (
          <div style={{ height: 6 * c, background: 'var(--fcc-border)', borderRadius: 3 * c, marginTop: 10 * c, width: '100%', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3 * c, background: member.color, width: `${stats?.percentage ?? 0}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

interface MemberStripProps {
  /** Members with a chore today; each gets a chip. */
  members: ChoreMember[];
  /** Members with chores on other days this week but none today: named in
   *  one quiet line under the chips instead of a 0/0 card each. */
  dayOff?: ChoreMember[];
  memberStats: Map<string, MemberStats>;
  weekData: WeekDayData[];
  detail: MemberChipDetail;
  /** Chip scale, see MemberChip. */
  c: number;
  gap: number;
  showStreaks: boolean;
  showPoints?: boolean;
  availableWidth: number;
}

/** Narrowest chip that still fits a name beside the avatar, at scale 1. */
const MIN_CHIP_WIDTH = 300;

export default function MemberStrip({
  members,
  dayOff = [],
  memberStats,
  weekData,
  detail,
  c,
  gap,
  showStreaks,
  showPoints,
  availableWidth,
}: MemberStripProps) {
  const t = useTranslate('modules');
  // Never more than three across: past that the names stop being readable
  // from the couch, which is the whole point of the wall chart. Rows are
  // balanced so seven members read 3 / 2 / 2, never a lone trailing chip.
  const perRow = Math.min(3, fitPerRow(availableWidth, MIN_CHIP_WIDTH * c, gap, members.length));
  const rows = balanceRows(members, perRow);
  const columns = rows[0]?.length ?? 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap }}>
          {row.map((member) => (
            <MemberChip
              key={member.id}
              member={member}
              stats={memberStats.get(member.id)}
              weekData={weekData}
              detail={detail}
              c={c}
              showStreaks={showStreaks}
              showPoints={showPoints}
            />
          ))}
        </div>
      ))}
      {dayOff.length > 0 && (
        <div
          data-testid="fcc-day-off"
          style={{ fontSize: 20 * c, fontWeight: 500, color: 'var(--fcc-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: `${2 * c}px ${6 * c}px 0` }}
        >
          {t('chore-chart.dayOffList', { names: dayOff.map((m) => m.name).join(', ') })}
        </div>
      )}
    </div>
  );
}

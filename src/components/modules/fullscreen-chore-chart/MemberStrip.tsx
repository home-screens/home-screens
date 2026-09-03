import type { ChoreMember } from '@/types/config';
import type { MemberStats, WeekDayData } from '@/components/modules/chore-chart/types';
import { balanceRows, fitPerRow } from '@/components/modules/chore-chart/layout';
import { Flame, Star, Ticket } from 'lucide-react';
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
  /** One-line chip (avatar, name, fraction) for a big family; no stars or bar. */
  compact: boolean;
  showStreaks: boolean;
  showPoints?: boolean;
}

function MemberChip({ member, stats, weekData, detail, c, compact, showStreaks, showPoints }: MemberChipProps) {
  const avatar = (compact ? 56 : 68) * c;
  const nameSize = (compact ? 25 : 28) * c;
  const statSize = 22 * c;
  const starSize = 22 * c;
  const stat = (
    <span style={{ fontSize: statSize, color: 'var(--fcc-text-2)', fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: statSize * 0.3 }}>
      {showStreaks && stats && stats.streak > 0 && (
        <span style={{ color: 'var(--fcc-accent)', display: 'inline-flex', alignItems: 'center', gap: statSize * 0.1 }}>
          <Flame size={statSize} />{stats.streak}
        </span>
      )}
      <span>{stats?.completed ?? 0}/{stats?.total ?? 0}</span>
      {showPoints && (stats?.rewardBalance ?? 0) > 0 && (
        <span style={{ color: 'var(--fcc-accent)', display: 'inline-flex', alignItems: 'center', gap: statSize * 0.15 }}>
          <Ticket size={statSize} />{stats!.rewardBalance}
        </span>
      )}
    </span>
  );

  return (
    <div
      data-testid="fcc-member-chip"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14 * c,
        padding: compact ? `${10 * c}px ${14 * c}px` : `${16 * c}px ${18 * c}px`,
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
          color: 'white',
        }}
      >
        <ChoreIcon value={member.emoji} size={avatar * 0.55} color="white" bare />
      </div>
      {compact ? (
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: nameSize, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fcc-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {member.name}
          </div>
          <div style={{ marginTop: 1 * c, whiteSpace: 'nowrap', overflow: 'hidden' }}>{stat}</div>
        </div>
      ) : (
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: nameSize, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fcc-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {member.name}
          </div>
          <div style={{ marginTop: 2 * c, whiteSpace: 'nowrap', overflow: 'hidden' }}>{stat}</div>
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
      )}
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
  /** Chips across before a second row: 3 on a portrait panel, 4 in landscape. */
  maxPerRow?: number;
}

/** Narrowest full chip that still fits a name beside the avatar, at scale 1. */
const MIN_CHIP_WIDTH = 300;
/** Narrowest compact chip (avatar, name over fraction, no stars). */
const MIN_COMPACT_WIDTH = 200;
/** Average Inter glyph width at weight 700, as a fraction of the font size. */
const GLYPH_EM = 0.58;
/** A lone chip stops here rather than spanning the panel. */
const MAX_LONE_WIDTH = 560;

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
  maxPerRow = 3,
}: MemberStripProps) {
  const t = useTranslate('modules');
  // Full chips up to two rows; past that the block would outweigh the chore
  // list, so a big family gets one-line chips. Rows are balanced so seven
  // members read 4 / 3, never a lone trailing chip.
  // A chip is never narrower than its longest name needs, so names are not
  // cut short to fit one more across.
  const longest = members.reduce((n, m) => Math.max(n, m.name.length), 0);
  const fullMin = Math.max(MIN_CHIP_WIDTH * c, longest * GLYPH_EM * 28 * c + 120 * c);
  const fullPerRow = Math.min(maxPerRow, fitPerRow(availableWidth, fullMin, gap, members.length));
  const compact = members.length > fullPerRow * 2;
  const compactMin = Math.max(MIN_COMPACT_WIDTH * c, longest * GLYPH_EM * 25 * c + 100 * c);
  const perRow = compact
    ? Math.min(maxPerRow + 1, fitPerRow(availableWidth, compactMin, gap, members.length))
    : fullPerRow;
  const rows = balanceRows(members, perRow);
  const columns = rows[0]?.length ?? 1;
  const lone = members.length === 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap, maxWidth: lone ? MAX_LONE_WIDTH * c : undefined }}>
          {row.map((member) => (
            <MemberChip
              key={member.id}
              member={member}
              stats={memberStats.get(member.id)}
              weekData={weekData}
              detail={detail}
              c={c}
              compact={compact}
              showStreaks={showStreaks}
              showPoints={showPoints}
            />
          ))}
        </div>
      ))}
      {dayOff.length > 0 && (
        <div
          data-testid="fcc-day-off"
          style={{ fontSize: 24 * c, fontWeight: 500, color: 'var(--fcc-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: `${2 * c}px ${6 * c}px 0` }}
        >
          {t('chore-chart.dayOffList', { names: dayOff.map((m) => m.name).join(', ') })}
        </div>
      )}
    </div>
  );
}

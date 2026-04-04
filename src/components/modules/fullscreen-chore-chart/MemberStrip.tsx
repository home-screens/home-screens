import type { ChoreMember } from '@/types/config';
import type { MemberStats } from '@/components/modules/chore-chart/types';
import { Flame } from 'lucide-react';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';

// ─── MemberChip (internal) ───

interface MemberChipProps {
  member: ChoreMember;
  stats: MemberStats | undefined;
  chipHeight: number;
  showStreaks: boolean;
  showPoints?: boolean;
}

function MemberChip({ member, stats, chipHeight, showStreaks, showPoints }: MemberChipProps) {
  const avatarSize = chipHeight * 0.65;
  const nameFontSize = chipHeight * 0.24;
  const statFontSize = chipHeight * 0.19;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: chipHeight * 0.2,
        padding: `${chipHeight * 0.15}px ${chipHeight * 0.2}px`,
        background: 'var(--fcc-surface)',
        borderRadius: chipHeight * 0.2,
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: '50%',
          background: member.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <ChoreIcon value={member.emoji} size={avatarSize * 0.5} color="white" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: nameFontSize, fontWeight: 600, color: 'var(--fcc-text)' }}>
          {member.name}
        </div>
        <div style={{ fontSize: statFontSize, color: 'var(--fcc-text-2)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3 }}>
          {showStreaks && stats && stats.streak > 0 && (
            <span style={{ color: 'var(--fcc-accent)', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <Flame size={statFontSize} /> {stats.streak}
              <span style={{ color: 'var(--fcc-text-2)', margin: '0 2px' }}>&middot;</span>
            </span>
          )}
          {stats?.completed ?? 0}/{stats?.total ?? 0}
          {showPoints && (stats?.rewardBalance ?? 0) > 0 && (
            <>
              <span style={{ color: 'var(--fcc-text-2)', margin: '0 2px' }}>&middot;</span>
              <span style={{ color: '#a78bfa' }}>🎟️{stats!.rewardBalance}</span>
            </>
          )}
        </div>
        {/* Mini progress bar */}
        <div style={{ height: chipHeight * 0.05, background: 'var(--fcc-border)', borderRadius: 2, marginTop: chipHeight * 0.05, width: '100%', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, background: member.color, width: `${stats?.percentage ?? 0}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── MemberStrip ───

interface MemberStripProps {
  members: ChoreMember[];
  memberStats: Map<string, MemberStats>;
  chipHeight: number;
  gap: number;
  showStreaks: boolean;
  showPoints?: boolean;
  availableWidth: number;
}

export default function MemberStrip({
  members,
  memberStats,
  chipHeight,
  gap,
  showStreaks,
  showPoints,
  availableWidth,
}: MemberStripProps) {
  // Calculate how many chips fit per row
  const minChipWidth = chipHeight * 2.6;
  const perRow = Math.max(1, Math.floor((availableWidth + gap) / (minChipWidth + gap)));
  const rows: string[][] = [];
  for (let i = 0; i < members.length; i += perRow) {
    rows.push(members.slice(i, i + perRow).map((m) => m.id));
  }
  // Evenly distribute: if last row has fewer items, re-balance across rows
  const rowCount = rows.length;
  let balanced = rows;
  if (rowCount > 1) {
    const itemsPerRow = Math.ceil(members.length / rowCount);
    balanced = [];
    for (let i = 0; i < members.length; i += itemsPerRow) {
      balanced.push(members.slice(i, i + itemsPerRow).map((m) => m.id));
    }
  }

  const memberMap = new Map(members.map((m) => [m.id, m]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {balanced.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap }}>
          {row.map((id) => {
            const member = memberMap.get(id);
            if (!member) return null;
            return (
              <MemberChip
                key={id}
                member={member}
                stats={memberStats.get(id)}
                chipHeight={chipHeight}
                showStreaks={showStreaks}
                showPoints={showPoints}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

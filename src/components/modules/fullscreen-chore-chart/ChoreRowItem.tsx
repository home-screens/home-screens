import type { ChoreMember } from '@/types/config';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import AssigneeDot from './AssigneeDot';
import type { ChoreRow, ToggleParams } from './helpers';

interface ChoreRowItemProps {
  row: ChoreRow;
  fontSize: number;
  dotSize: number;
  isFirst: boolean;
  showPoints: boolean;
  memberMap: Map<string, ChoreMember>;
  initialsMap: Map<string, string>;
  allowTouch: boolean;
  onToggle: (params: ToggleParams) => void;
}

export default function ChoreRowItem({
  row,
  fontSize,
  dotSize,
  isFirst,
  showPoints,
  memberMap,
  initialsMap,
  allowTouch,
  onToggle,
}: ChoreRowItemProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: `${fontSize * 0.4}px ${fontSize * 0.3}px`,
        gap: fontSize * 0.6,
        borderTop: isFirst ? 'none' : '1px solid var(--fcc-border-sub)',
      }}
    >
      {row.choreEmoji && (
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <ChoreIcon value={row.choreEmoji} size={fontSize * 1.15} color="var(--fcc-text-2)" />
        </span>
      )}
      <span
        style={{
          flex: 1,
          fontSize,
          fontWeight: 500,
          color: 'var(--fcc-text)',
          minWidth: 0,
        }}
      >
        {row.choreName}
        {showPoints && row.points > 1 && (
          <span style={{ fontSize: fontSize * 0.7, color: 'var(--fcc-text-2)', fontWeight: 600, marginLeft: fontSize * 0.3 }}>
            {row.points}pt
          </span>
        )}
      </span>
      <div style={{ display: 'flex', gap: Math.max(dotSize * 0.2, 8), flexShrink: 0 }}>
        {row.assignees.map((a) => {
          const member = memberMap.get(a.memberId);
          if (!member) return null;
          return (
            <AssigneeDot
              key={a.memberId}
              memberId={a.memberId}
              isCompleted={a.isCompleted}
              dotSize={dotSize}
              choreId={row.choreId}
              choreName={row.choreName}
              memberName={member.name}
              memberColor={member.color}
              initial={initialsMap.get(a.memberId) ?? member.name[0]}
              allowTouch={allowTouch}
              onToggle={onToggle}
            />
          );
        })}
      </div>
    </div>
  );
}

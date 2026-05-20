'use client';

import type { ChoreMember, ChoreTimeOfDay } from '@/types/config';
import { useTranslate } from '@/i18n';
import ChoreRowItem from './ChoreRowItem';
import { TOD_ICONS, type ChoreRow, type ToggleParams } from './helpers';

// ─── TimeBandHeader (shared between portrait TimeBand and landscape columns) ───

interface TimeBandHeaderProps {
  tod: ChoreTimeOfDay;
  fontSize: number;
  currentTod: ChoreTimeOfDay | null;
  style?: React.CSSProperties;
}

export function TimeBandHeader({ tod, fontSize, currentTod, style }: TimeBandHeaderProps) {
  const TodIcon = TOD_ICONS[tod];
  const isCurrent = tod === currentTod;
  const headerColor = isCurrent ? 'var(--fcc-accent)' : 'var(--fcc-text-3)';
  const t = useTranslate('modules');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: fontSize * 0.4,
        ...style,
      }}
    >
      <TodIcon size={fontSize * 1.1} color={headerColor} strokeWidth={2} />
      <span
        style={{
          fontSize: fontSize * 0.8,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: headerColor,
        }}
      >
        {t(`fullscreen-chore-chart.timeOfDay.${tod}`)}
      </span>
    </div>
  );
}

// ─── TimeBand ───

interface TimeBandProps {
  tod: ChoreTimeOfDay;
  rows: ChoreRow[];
  fontSize: number;
  dotSize: number;
  showHeader: boolean;
  showPoints: boolean;
  currentTod: ChoreTimeOfDay | null;
  memberMap: Map<string, ChoreMember>;
  initialsMap: Map<string, string>;
  allowTouch: boolean;
  onToggle: (params: ToggleParams) => void;
}

export default function TimeBand({
  tod,
  rows,
  fontSize,
  dotSize,
  showHeader,
  showPoints,
  currentTod,
  memberMap,
  initialsMap,
  allowTouch,
  onToggle,
}: TimeBandProps) {
  return (
    <div>
      {showHeader && (
        <TimeBandHeader
          tod={tod}
          fontSize={fontSize}
          currentTod={currentTod}
          style={{ padding: `${fontSize * 0.6}px ${fontSize * 0.3}px ${fontSize * 0.3}px` }}
        />
      )}
      {rows.map((row, i) => (
        <ChoreRowItem
          key={row.choreId}
          row={row}
          fontSize={fontSize}
          dotSize={dotSize}
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
